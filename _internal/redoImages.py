import os

with open('_internal/known','r') as f:
    lines = [set(line.strip().split(' ')) for line in f]

for (_,_,fns) in os.walk('heatmap'):
    known = { fn[:-4] for fn in fns }
    break

with open('_internal/known','w') as f:
    for line in lines:
        f.write(' '.join(line.difference(known)))
        f.write('\n')

print('Cleared %d images, now run regenerate.py.' % (len(known)))
