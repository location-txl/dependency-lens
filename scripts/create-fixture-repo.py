#!/usr/bin/env python3
"""Populate the example's deterministic local Maven repository (no network)."""
import argparse
import zipfile
from pathlib import Path


def populate(root):
    root=Path(root)
    def dependency(name,version):
        return f'<dependency><groupId>lens.fixture</groupId><artifactId>{name}</artifactId><version>{version}</version></dependency>'
    def artifact(name,version,dependencies=''):
        path=root/'repo/lens/fixture'/name/version
        path.mkdir(parents=True,exist_ok=True)
        (path/f'{name}-{version}.pom').write_text(f'<project><modelVersion>4.0.0</modelVersion><groupId>lens.fixture</groupId><artifactId>{name}</artifactId><version>{version}</version><dependencies>{dependencies}</dependencies></project>')
        with zipfile.ZipFile(path/f'{name}-{version}.jar','w'): pass
    artifact('shared','1.0')
    artifact('shared','2.0',dependency('leaf','1.0'))
    artifact('leaf','1.0')
    artifact('first','1.0',dependency('shared','1.0'))
    artifact('second','1.0',dependency('shared','2.0'))
    artifact('compile-only','1.0')
    artifact('runtime-only','1.0')
    for name in ['app','core','network','feature']:
        folder=root/name/'src/main';folder.mkdir(parents=True,exist_ok=True)
        # Old AGP reads package; AGP 8+ reads namespace from the DSL instead.
        (folder/'AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" />\n')
    (root/'app/libs').mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(root/'app/libs/local.jar','w'): pass


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory',nargs='?',type=Path,default=Path(__file__).resolve().parents[1]/'examples/android')
    args=p.parse_args();populate(args.directory);print('Local fixture repository ready:',args.directory)
