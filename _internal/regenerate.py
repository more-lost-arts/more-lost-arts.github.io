import json, os, cv2, numpy as np, requests, traceback

known = set()
known.add(None)
with open('_internal/known','r') as f:
    for line in f:
        for id in line.strip().split(' '):
            known.add(id)

def renormalizeName(name):
    if name[-4:] != '.png':
        return (None,None)
    [head3,tail3] = os.path.split(name)
    [head2,tail2] = os.path.split(head3)
    [head1,tail1] = os.path.split(head2)
    [tail3,art] = tail3[:-4].split('_')
    card = int(tail1)*10000 + int(tail2)*100 + int(tail3)
    art = int(art)
    return (('%d_%d') % (card,art), name)

enArtworks = dict( renormalizeName(os.path.join(dp,f)) for (dp,dn,fn) in os.walk('D:\\yugioh\\ygodb-repos\\artworks-en-n.ygorganization.com') for f in fn )
jpArtworks = dict( renormalizeName(os.path.join(dp,f)) for (dp,dn,fn) in os.walk('D:\\yugioh\\ygodb-repos\\artworks-jp-n.ygorganization.com') for f in fn )

newArtworks = set(enArtworks.keys()).difference(known).intersection(set(jpArtworks.keys()))

with open('data.json','r',encoding='utf-8') as f:
    dataJson = json.load(f)

print('Processing %d new artworks...' % (len(newArtworks),))
mask = np.zeros((372,256),dtype='uint8')
cv2.rectangle(mask, pt1=(33,70), pt2=(224,229), color=255, thickness=-1)
n=0
failed = set()
for id in newArtworks:
    #if n >= 10: # leash it, for now
    if False: # unleash it
        failed.add(id)
        continue

    try:
        [cardId, artId] = id.split('_')
        
        enArtwork = cv2.imread(enArtworks[id])
        jpArtwork = cv2.imread(jpArtworks[id])
        
        enShape = enArtwork.shape[:2]
        jpShape = jpArtwork.shape[:2]
        if enShape != (372,256):
            print('shape mismatch: en',enShape,id)
            continue
        if jpShape != (372,256):
            print('shape mismatch: jp',jpShape,id)
            continue
        
        diff = enArtwork.copy()
        cv2.absdiff(enArtwork, jpArtwork, diff)
        diff = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
        
        diff = cv2.bitwise_and(diff, diff, mask=mask)
        
        (T,diff) = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
        diff = cv2.morphologyEx(diff, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_CROSS,(5,5)))
        
        (numLabels, labels, stats, centroids) = cv2.connectedComponentsWithStats(diff, 8)
        if numLabels <= 1:
            continue
        
        with requests.get('https://db.ygorganization.com/data/card/'+(id.split('_')[0])) as resp:
            cardJson = resp.json()
            dataJson[id] = { 'enName': cardJson['cardData']['en']['name'], 'jpName': cardJson['cardData']['ja']['name'] }
        
        print('Found difference on #%s (%s) artwork #%s.' % (cardId, dataJson[id]['enName'], artId))
        
        heatmap = np.zeros((372,256),dtype='uint8')
        for i in range(1, numLabels):
            (cX, cY) = centroids[i]
            w = stats[i, cv2.CC_STAT_WIDTH]
            h = stats[i, cv2.CC_STAT_HEIGHT]
            cv2.ellipse(heatmap, (int(round(cX)), int(round(cY))), (int(round(w)),int(round(h))), 0, 0, 360, 255, -1)
        
        outlines = np.zeros((372,256,4),dtype='uint8')
        cnts = cv2.findContours(heatmap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnts = cnts[0] if len(cnts) == 2 else cnts[1]
        for c in cnts:
            cv2.drawContours(outlines, [c], -1, (0, 0, 255, 255), thickness=2)

        cv2.imwrite('heatmap/'+id+'.png', outlines, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        n += 1
        
    except Exception as e:
        print('Failed on', id, enArtworks[id])
        traceback.print_exc()
        failed.add(id)

newArtworks = newArtworks.difference(failed)
print('Processed %d artworks, found %d new differences.' % (len(newArtworks), n))

if n > 0:
    with open('data.json','w',encoding='utf-8') as of:
        json.dump(dataJson, of, sort_keys=True, indent=1, ensure_ascii=False)

if newArtworks:
    with open('_internal/known','a') as of:
        of.write(' '.join(newArtworks))
        of.write('\n')
