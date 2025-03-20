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

const _artworkManifest = (async () => { return (await (await fetch('https://artworks.ygoresources.com/manifest.json')).json()).cards; })();

let _resolveFully = null;

const __resolveFully = (async (entry) => {
    try {
        const [cardId, artId] = entry.id.split('_');
        const artworkData = (await _artworkManifest)[cardId]?.[artId];
        if (!(artworkData && artworkData.bestTCG && artworkData.bestOCG))
            throw 'artwork not found';
        
        const tcgArt = new URL(artworkData.bestTCG, 'https://artworks.ygoresources.com/');
        const ocgArt = new URL(artworkData.bestOCG, 'https://artworks.ygoresources.com/');
        
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
    document.title = 'Loading… - Yu-Gi-Oh! Artwork Differences';
    document.body.className = 'has-modal modal-loading-img';
    await stopAnimationLoop();
    
    const entry = await entryPromise;
    
    currentEntry = entry;
    removeAllChildren(document.getElementById('tcg'));
    removeAllChildren(document.getElementById('ocg'));
    removeAllChildren(document.getElementById('diff'));
    const [cardId] = entry.id.split('_'); // Extract card number
    const cardLink = `https://db.ygoresources.com/card#${cardId}`;
    const cardNameElement = document.getElementById('card-name');

    // Create a hyperlink
    const cardLinkElement = document.createElement('a');
    cardLinkElement.href = cardLink;
    cardLinkElement.textContent = entry.enName;
    cardLinkElement.target = '_blank'; // Open in new tab

    // Clear and append the new link
    removeAllChildren(cardNameElement);
    cardNameElement.appendChild(cardLinkElement);

    document.getElementById('tcg').appendChild(entry.tcgArt);
    document.getElementById('ocg').appendChild(entry.ocgArt);
    document.getElementById('diff').appendChild(entry.diffArt);
    
    const permalink = new URL(document.location);
    permalink.hash = ('#'+entry.id);
    document.getElementById('permalink').href = permalink.href;
    
    if (document.location.hash === permalink.hash)
    {
        document.title = (entry.enName+' - Yu-Gi-Oh! Artwork Differences');
    }
    else
    {
        document.title = ('More Lost Arts: Yu-Gi-Oh! Artwork Differences');
        window.history.replaceState(null, '', '/');
    }
    
    document.getElementById('bluesky-link').href = ('https://bsky.app/intent/compose?text='+encodeURIComponent('Did you know that '+entry.enName+' has different artwork in Japan? I found out today!')+'&url='+encodeURIComponent(permalink.href)+'&hashtags=yugioh');
    document.getElementById('facebook-link').href = ('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(permalink.href)+'&t='+encodeURIComponent('Did you know that '+entry.enName+' has different artwork in Japan? I found out today! #yugioh'));
    document.getElementById('false-positive').href = ('https://github.com/more-lost-arts/more-lost-arts.github.io/issues/new?title='+encodeURIComponent('False Positive: '+entry.enName)+'&body='+encodeURIComponent('**Permalink:** '+permalink.href+'\n\n<!-- add additional information below this line, if required -->'));
    
    document.body.className = '';
    startAnimationLoop();
});

document.getElementById('permalink').addEventListener('click', function(e) {
    e.preventDefault();
    navigator.clipboard.writeText(this.href).then(() => { window.alert('Copied to clipboard!'); });
});

document.getElementById('another').addEventListener('click', () => { if (!document.body.classList.contains('has-modal')) Load(ResolveNext(currentEntry)); });

document.getElementById('search').addEventListener('click', function() { this.classList.add('expanded'); document.getElementById('search-box').focus(); });
document.getElementById('search-box').addEventListener('blur', () => { document.getElementById('search').classList.remove('expanded'); });

const _searchNormalize = ((t) => t.replaceAll(/[^a-zA-Z0-9]/g,'').toLowerCase());
document.getElementById('search-box').addEventListener('keyup', async function(e) {
    if (this.searchLock) return;
    if (e.keyCode !== 13) return;
    const oNeedle = this.value;
    if (this.lastNeedle === oNeedle) return;
    this.lastNeedle = oNeedle;
    const needle = _searchNormalize(oNeedle);
    if (needle.length < 5) return;
    e.preventDefault();
    this.blur();
    
    this.searchLock = true;
    try {
        const data = await _data;
        let entry = data.first;
        do {
            if (_searchNormalize(entry.enName).includes(needle)) {
                this.value = '';
                this.lastNeedle = null;
                Load(_resolveFully(entry));
                return;
            }
            entry = entry.next;
        } while (entry !== data.first);
        window.alert('Not found: \''+oNeedle+'\'');
        document.getElementById('search').classList.add('expanded');
        this.focus();
    } finally { this.searchLock = false; }
});

(async () => {
    Load((await ResolveFirst(document.location.hash && document.location.hash.substring(1)))[0]);
})();

/* settings */
(() => {
    const disableHighlights = (window.localStorage.getItem('disableHighlights') === 'true');
    if (disableHighlights) document.getElementById('diff').classList.add('disabled');
    
    for (const btn of document.querySelectorAll('.control-button[data-show-diff]')) {
        const isDisable = (btn.dataset.showDiff === 'no');
        if (isDisable === disableHighlights) btn.classList.add('selected');
        btn.addEventListener('click', () => {
            document.querySelectorAll('.control-button[data-show-diff].selected').forEach((b) => b.classList.remove('selected'));
            window.localStorage.setItem('disableHighlights', isDisable);
            document.getElementById('diff').classList.toggle('disabled', isDisable);
        });
    }
})();

})();
