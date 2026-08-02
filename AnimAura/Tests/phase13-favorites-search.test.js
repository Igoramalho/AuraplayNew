const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');
testFavorites();
testGenres();
testSearchStructure();
console.log('PASS: favoritos, contagem pública, filtros, ícones e resultados remotos');

function testFavorites() {
    const start = html.indexOf('const NATIVE_FAVORITES_BASE64');
    const end = html.indexOf('function createViewNavigation', start);
    if (start < 0 || end < 0) throw new Error('Implementação de favoritos não localizada.');
    const legacy = ['old-id', { id: 'old-id', title: 'Registro atualizado' }, { animeId: 'uuid-id', title: 'UUID' }];
    const encoded = Buffer.from(JSON.stringify(legacy), 'utf8').toString('base64');
    const source = html.slice(start, end).replace('"__AURAPLAY_FAVORITES_BASE64__"', JSON.stringify(encoded));
    const context = { atob, btoa, TextDecoder, TextEncoder, Uint8Array, window: {}, console };
    vm.createContext(context);
    vm.runInContext(`${source};globalThis.records=[...favoriteRecords.values()];globalThis.normalizeFavoriteRecord=normalizeFavoriteRecord;`, context);
    assert(context.records.length === 2, 'Favoritos antigos não foram deduplicados por animeId.');
    assert(context.records.find(item => item.animeId === 'old-id')?.title === 'Registro atualizado', 'Registro antigo mais completo não foi preservado.');
    assert(context.normalizeFavoriteRecord('textual-id').animeId === 'textual-id', 'Compatibilidade com ID textual falhou.');
}

function testGenres() {
    const start = html.indexOf('const GENRE_ALIASES');
    const end = html.indexOf('function refreshSearchIcons', start);
    if (start < 0 || end < 0) throw new Error('Implementação dos filtros não localizada.');
    const context = { activeGenreFilter: 'Todos' };
    vm.createContext(context);
    vm.runInContext(`${html.slice(start, end)};globalThis.applyGenreFilter=applyGenreFilter;`, context);
    const items = [
        { title: 'A', genres: ['Action', 'Adventure'] },
        { title: 'B', genres: ['Fantasia'] },
        { title: 'C', genres: ['Science Fiction'] }
    ];
    assert(context.applyGenreFilter(items).length === 3, 'Todos não removeu somente o filtro.');
    for (const [genre, expected] of [['Ação', 'A'], ['Fantasia', 'B'], ['Sci-Fi', 'C'], ['Aventura', 'A']]) {
        context.activeGenreFilter = genre;
        assert(context.applyGenreFilter(items).map(item => item.title).join(',') === expected, `Filtro ${genre} falhou.`);
    }
}

function testSearchStructure() {
    const filterSource = between('function filterGenre', '// Toggle Favorite State');
    assert(!filterSource.includes("catalogSearchInput').value ="), 'Filtro ainda substitui o texto digitado.');
    assert(html.includes('runRemote && query.length >= MIN_REMOTE_QUERY_LENGTH'), 'Pesquisa remota não exige texto mínimo.');
    assert(html.includes("card.onclick = () => openRemoteDetails(remote)"), 'Card remoto não abre detalhes informativos.');
    assert(html.includes("detailsMode = 'remote'"), 'Estado de detalhes remotos ausente.');
    assert(html.includes('refreshSearchIcons();'), 'Pesquisa não reinicializa os ícones Lucide.');
    assert(html.includes('renderSearchSnapshots();'), 'Snapshot da pesquisa não é restaurado visualmente.');
    assert(html.includes('getPublicEpisodeCount(anime)'), 'Cards não usam a contagem pública conhecida.');
    assert(html.includes('propagatePublicEpisodeCount'), 'Contagem pública não é propagada aos componentes.');
}

function between(startMarker, endMarker) {
    const start = html.indexOf(startMarker);
    const end = html.indexOf(endMarker, start);
    return html.slice(start, end);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
