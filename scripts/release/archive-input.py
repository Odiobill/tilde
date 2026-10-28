"""Bounded validation before extracting a supplied local source archive."""
import sys, tarfile, posixpath

def validate(path, root):
    names, links = set(), []
    total = 0
    with tarfile.open(path) as archive:
        for index, member in enumerate(archive):
            name = member.name.rstrip('/')
            if index > 20000 or not name or name.startswith('/') or any(p in ('', '.', '..') for p in name.split('/')):
                raise ValueError('UNSAFE_ARCHIVE')
            if name != root and not name.startswith(root + '/'):
                raise ValueError('WRONG_ARCHIVE_ROOT')
            if name in names or member.mode & 0o6000 or not (member.isfile() or member.isdir() or member.issym()):
                raise ValueError('UNSAFE_ARCHIVE')
            names.add(name)
            total += member.size
            if total > 512 * 1024 * 1024:
                raise ValueError('ARCHIVE_TOO_LARGE')
            if member.issym():
                target = posixpath.normpath(posixpath.join(posixpath.dirname(name), member.linkname))
                if member.linkname.startswith('/') or not target.startswith(root + '/'):
                    raise ValueError('UNSAFE_ARCHIVE_LINK')
                links.append(target)
    if any(target not in names for target in links):
        raise ValueError('BROKEN_ARCHIVE_LINK')

if __name__ == '__main__':
    try:
        validate(sys.argv[1], sys.argv[2])
    except Exception:
        raise SystemExit('SOURCE_ARCHIVE_INVALID')
