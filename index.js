(()=>{
    
const sleep = ((ms) => new Promise((r) => window.setTimeout(r,ms)));

const removeAllChildren = ((e) => { while (e.lastChild) e.removeChild(e.lastChild); });

const _data = (async () => {
    const data = await (await fetch('data.json')).json();
    const ids = Object.keys(data);
    /* random shuffle */
    for (let idx = ids.length; idx > 0;) {
        const i = Math.floor(Math.random() * idx); /* 0 <= i < idx */
        --idx;
        [ids[idx], ids[i]] = [ids[i], ids[idx]] /* swap [i] <-> [idx] */
    }
    for (let i=0, n=ids.length; i<n; ++i) {
        data[ids[i]].id = ids[i];
        data[ids[i]].next = data[ids[(i+1)%n]];
    }
    
    data.first = data[ids[0]];
    
    return data;
})();

const _artworkManifest = (async () => { return (await (await fetch('https://artworks.ygorganization.com/manifest.json')).json()).cards; })();

let _resolveFully = null;

const __resolveFully = (async (entry) => {
    try {
        const [cardId, artId] = entry.id.split('_');
        const artworkData = (await _artworkManifest)[cardId]?.[artId];
        if (!(artworkData && artworkData.bestTCG && artworkData.bestOCG))
            throw 'artwork not found';
        
        const tcgArt = new URL(artworkData.bestTCG, 'https://artworks.ygorganization.com/');
        const ocgArt = new URL(artworkData.bestOCG, 'https://artworks.ygorganization.com/');
        
        entry.tcgArt = new Image();
        entry.tcgArt.src = tcgArt.href;
        
        entry.ocgArt = new Image();
        entry.ocgArt.src = ocgArt.href;
        
        entry.diffArt = new Image();
        entry.diffArt.src = ('/heatmap/'+(entry.id)+'.png');
        
        await entry.tcgArt.decode();
        await entry.ocgArt.decode();
        await entry.diffArt.decode();
        
        return entry;
    } catch (e) {
        console.warn('failed to resolve', entry, e);
        return _resolveFully(entry.next);
    }
});

_resolveFully = ((entry) => (entry._fully || (entry._fully = __resolveFully(entry))));

let _animationStep = 0;
let _animationInterval = 0;
const _doAnimationStep = (() => {
    _animationStep = (_animationStep+1)%18;
    document.getElementById('main-row').className = ('step-'+_animationStep);
});

const stopAnimationLoop = (() => {
    if (!_animationInterval) return Promise.resolve();
    window.clearInterval(_animationInterval);
    _animationInterval = 0;
    _animationStep = -1;
    _doAnimationStep();
    return sleep(1200);
});

const startAnimationLoop = (() => {
    stopAnimationLoop();
    _animationInterval = window.setInterval(_doAnimationStep, 400);
});

const ResolveNext = ((current) => _resolveFully(current.next));

const ResolveFirst = (async (id) => {
    await _artworkManifest;
    const data = await _data;
    return [_resolveFully((id && data[id]) || data.first)];
});

let currentEntry = null;
const Load = (async (entryPromise) => {
    const clearAnimationDelay = stopAnimationLoop();
    document.body.className = 'has-modal modal-loading-img';
    
    const entry = await entryPromise;
    
    currentEntry = entry;
    removeAllChildren(document.getElementById('tcg'));
    removeAllChildren(document.getElementById('ocg'));
    removeAllChildren(document.getElementById('diff'));
    document.getElementById('card-name').innerText = entry.enName;
    document.getElementById('tcg').appendChild(entry.tcgArt);
    document.getElementById('ocg').appendChild(entry.ocgArt);
    document.getElementById('diff').appendChild(entry.diffArt);
    
    const permalink = new URL(document.location);
    permalink.hash = ('#'+entry.id);
    document.getElementById('permalink').href = permalink.href;
    
    document.getElementById('twitter-link').href = ('https://twitter.com/intent/tweet?text='+encodeURIComponent('Did you know that '+entry.enName+' has different artwork in Japan? I found out today!')+'&url='+encodeURIComponent(permalink.href)+'&hashtags=yugioh');
    
    await clearAnimationDelay;
    document.body.className = '';
    startAnimationLoop();
});

document.getElementById('permalink').addEventListener('click', function(e) {
    e.preventDefault();
    navigator.clipboard.writeText(this.href).then(() => { window.alert('Copied to clipboard!'); });
});

document.getElementById('another').addEventListener('click', () => { if (!document.body.classList.contains('has-modal')) Load(ResolveNext(currentEntry)); });

(async () => {
    Load((await ResolveFirst(document.location.hash && document.location.hash.substring(1)))[0]);
})();

})();
