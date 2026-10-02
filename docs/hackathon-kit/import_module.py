#!/usr/bin/env python3
"""Import exact approved source files. Does not create commits or push branches."""
import argparse, json, subprocess, sys
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('group')
parser.add_argument('--part', choices=['1','2','all'], default='all')
parser.add_argument('--list', action='store_true')
args=parser.parse_args()
manifest=json.loads(Path(__file__).with_name('module-manifest.json').read_text(encoding='utf-8'))
if args.group not in manifest['groups']: parser.error('Unknown group')
paths=manifest['groups'][args.group] if args.part=='all' else manifest['parts'][args.group][args.part]
if args.list:
    print('\n'.join(paths)); sys.exit(0)
root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
# Refuse to overwrite team edits; initial untracked handoff folder is harmless.
changed=subprocess.check_output(['git','diff','--name-only','HEAD'],text=True).splitlines()
changed+=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines()
collisions=sorted(set(paths)&set(changed))
if collisions: sys.exit('Stop: commit/stash these files before import: '+', '.join(collisions))
sha=manifest['sourceCommit']
subprocess.run(['git','cat-file','-e',sha+'^{commit}'],check=True,cwd=root)
subprocess.run(['git','--literal-pathspecs','restore','--source='+sha,'--staged','--worktree','--']+paths,check=True,cwd=root)
print(f'Imported/staged {len(paths)} files from {sha}. Review git diff --cached; then commit.')
