#!/usr/bin/env python3
"""Run real AGP builds. Each result records a tested version tuple, never an inferred pass."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import zipfile

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'build/compatibility'


def java_home(major):
    override=os.environ.get(f'LENS_JAVA_{major}')
    if override: return override
    if shutil.which('/usr/libexec/java_home'):
        return subprocess.check_output(['/usr/libexec/java_home','-v',str(major)],text=True).strip()
    raise RuntimeError(f'Set LENS_JAVA_{major} to a JDK {major} installation')


def distribution(version):
    for folder in [Path(os.environ.get('GRADLE_USER_HOME',str(Path.home()/'.gradle')))/'wrapper/dists']:
        found=list(folder.glob(f'gradle-{version}-bin/*/gradle-{version}/bin/gradle'))
        if found:return found[0]
    dest=WORK/'toolchains'; dest.mkdir(parents=True,exist_ok=True)
    binary=dest/f'gradle-{version}/bin/gradle'
    if binary.is_file(): return binary
    archive=dest/f'gradle-{version}-bin.zip'
    url=f'https://downloads.gradle.org/distributions/gradle-{version}-bin.zip'
    expected=subprocess.check_output(['curl','-fsSL','--retry','2','--retry-all-errors','--max-time','30',url+'.sha256'],text=True).strip()
    if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:
        subprocess.run(['curl','-fsSL','--retry','2','--retry-all-errors','--max-time','240',url,'-o',str(archive)],check=True,capture_output=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise RuntimeError('Gradle distribution checksum mismatch')
    with zipfile.ZipFile(archive) as zipped:zipped.extractall(dest)
    binary.chmod(0o755)
    return binary


def run_case(case,sdk):
    name=case['agp']+'-gradle-'+case['gradle']
    folder=WORK/name
    if folder.exists():shutil.rmtree(folder)
    shutil.copytree(ROOT/'examples/android',folder,ignore=shutil.ignore_patterns('build','.gradle','local.properties','repo'))
    spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/create-fixture-repo.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.populate(folder)
    if case['agp'].startswith(('7.0.','7.1.','7.2.')):
        for manifest in folder.glob('*/src/main/AndroidManifest.xml'):
            manifest.write_text(manifest.read_text().replace('<manifest ','<manifest package="dev.dependencylens.sample.'+manifest.parts[-4]+'" '))
    (folder/'local.properties').write_text('sdk.dir='+str(sdk)+'\n')
    env=os.environ.copy();env['JAVA_HOME']=java_home(case['java'])
    command=[str(distribution(case['gradle'])),'dependencyLensReport','--no-configuration-cache','--no-daemon','--console=plain',
             '-PagpVersion='+case['agp'],'-PsampleCompileSdk='+str(case['sdk']),'-PlensPluginJar='+str(ROOT/'build/libs/dependency-lens-gradle-plugin-0.1.0.jar')]
    started=time.monotonic()
    try:
        result=subprocess.run(command,cwd=folder,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=360)
        (folder/'gradle-output.log').write_text(result.stdout)
        if result.returncode:raise RuntimeError('Gradle exited '+str(result.returncode)+'; see isolated work log')
        reports=[]
        for path in sorted(folder.glob('*/build/dependency-lens/model.json')):reports.append(json.loads(path.read_text()))
        assert {r['path'] for r in reports}=={':app',':core',':network',':feature'},'missing Android module'
        for r in reports:
            assert 'paidDebug' not in r['availableVariants'],'disabled variant leaked'
            assert all(g['status']=='complete' for g in r['graphs']), 'incomplete graph: '+str([(r['path'],g['configuration'],g['issues']) for g in r['graphs'] if g['status']!='complete'])
        app=next(r for r in reports if r['path']==':app')
        runtime=next(g for g in app['graphs'] if g['configuration']=='freeReleaseRuntimeClasspath')
        compile=next(g for g in app['graphs'] if g['configuration']=='freeReleaseCompileClasspath')
        shared=next(n for n in runtime['nodes'] if n['name']=='shared')
        assert shared['version']=='2.0','incorrect selected version'
        assert any(e['to']==shared['id'] and e['changeKind']=='version' for e in runtime['edges']),'missing requested version'
        assert any(n['name']=='compile-only' for n in compile['nodes']) and not any(n['name']=='compile-only' for n in runtime['nodes'])
        assert any(n['name']=='runtime-only' for n in runtime['nodes']) and not any(n['name']=='runtime-only' for n in compile['nodes'])
        tasks=re.findall(r'^> Task (\S+)',result.stdout,re.M)
        assert all(t.endswith(':collectDependencyLensData') or t==':dependencyLensReport' for t in tasks),'report triggered build tasks: '+str(tasks)
        assert (folder/'build/reports/dependency-lens/index.html').is_file()
        insight=subprocess.run([str(distribution(case['gradle'])),':app:dependencyInsight','--configuration','freeReleaseRuntimeClasspath','--dependency','lens.fixture:shared','--no-configuration-cache','--no-daemon','--console=plain',*command[5:]],cwd=folder,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
        (folder/'dependency-insight.log').write_text(insight.stdout)
        assert insight.returncode==0 and 'lens.fixture:shared:2.0' in insight.stdout,'dependencyInsight mismatch'
        return {**case,'status':'passed','seconds':round(time.monotonic()-started,1),'modules':len(reports),'graphs':sum(len(r['graphs']) for r in reports),'dependencyInsight':'matched','buildTasksTriggered':False}
    except (RuntimeError,AssertionError,subprocess.TimeoutExpired) as error:
        # Detailed Gradle logs remain in work/, not in the portable distribution.
        message=str(error).replace(str(Path.home()),'[user]').replace(str(ROOT.parents[1]),'[workspace]')
        return {**case,'status':'failed','seconds':round(time.monotonic()-started,1),'error':message[:2000]}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--matrix',choices=['smoke','full'],default='smoke')
    parser.add_argument('--agp',help='Comma-separated AGP versions from the pinned matrix')
    parser.add_argument('--sdk',type=Path,default=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT'))
    parser.add_argument('--work-dir',type=Path,default=WORK,help='Isolated fixtures and verified Gradle distributions')
    args=parser.parse_args()
    WORK=args.work_dir.resolve()
    if not args.sdk:parser.error('Set ANDROID_HOME or pass --sdk')
    matrix=json.loads((ROOT/'docs/compatibility-matrix.json').read_text())
    cases=[c for c in matrix if (args.matrix=='full' or c.get('smoke')) and (not args.agp or c['agp'] in args.agp.split(','))]
    if not cases:parser.error('No matching pinned cases')
    results=[];WORK.mkdir(parents=True,exist_ok=True)
    for case in cases:
        print('Testing AGP',case['agp'],'/ Gradle',case['gradle'],'/ JDK',case['java'],flush=True)
        try:result=run_case(case,args.sdk)
        except Exception as e:result={**case,'status':'failed','error':str(e)[:1000]}
        results.append(result)
        print(json.dumps(result,ensure_ascii=False),flush=True)
        target=ROOT/'docs'/('compatibility-results-'+args.matrix+('.subset' if args.agp else '')+'.json')
        target.write_text(json.dumps({'executedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'results':results},ensure_ascii=False,indent=2)+'\n')
    raise SystemExit(any(r['status']!='passed' for r in results))
