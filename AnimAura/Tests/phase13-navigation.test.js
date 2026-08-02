const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');
const start = html.indexOf('function createViewNavigation');
const end = html.indexOf('const viewNavigation', start);
if (start < 0 || end < 0) throw new Error('Controlador de navegação não encontrado.');

const context = {};
vm.createContext(context);
vm.runInContext(`${html.slice(start, end)};globalThis.createViewNavigation=createViewNavigation;`, context);

testFlow('Pesquisa → Detalhes → Player → Detalhes → Pesquisa', 'search');
testFlow('Home → Detalhes → Player → Detalhes → Home', 'home');

const continueFlow = context.createViewNavigation('home');
continueFlow.go('player', { scrollTop: 240 });
const returnToHome = continueFlow.back();
assert(returnToHome.viewName === 'home' && returnToHome.state.scrollTop === 240, 'Continue Watching não retornou à tela anterior real.');

const duplicateFlow = context.createViewNavigation('search');
assert(duplicateFlow.go('search', {}) === false && duplicateFlow.depth === 0, 'Transição duplicada foi adicionada à pilha.');

const remoteFlow = context.createViewNavigation('search');
remoteFlow.go('details', { query: 'consulta remota', genre: 'Todos', scrollTop: 320 });
assert(remoteFlow.back().viewName === 'search', 'Detalhes remotos não retornaram à Pesquisa.');

const settingsFlow = context.createViewNavigation('search');
settingsFlow.go('settings', { query: 'pesquisa preservada', genre: 'Sci-Fi', scrollTop: 140 });
const searchAfterSettings = settingsFlow.back();
assert(searchAfterSettings.viewName === 'search' && searchAfterSettings.state.query === 'pesquisa preservada', 'Configurações não restaurou a Pesquisa.');

console.log('PASS: fluxos de navegação Home, Pesquisa, Detalhes, Player e Continue Watching');

function testFlow(label, origin) {
    const navigation = context.createViewNavigation(origin);
    const originState = { query: origin === 'search' ? 'termo preservado' : '', scrollTop: 180 };
    navigation.go('details', originState);
    navigation.go('player', { animeId: 'catalog-id', seasonId: 'season-id', scrollTop: 90 });
    const details = navigation.back();
    const firstOrigin = navigation.back();
    assert(details.viewName === 'details' && details.state.seasonId === 'season-id', `${label}: detalhes/temporada não foram restaurados.`);
    assert(firstOrigin.viewName === origin && firstOrigin.state.scrollTop === 180, `${label}: origem não foi restaurada.`);
    if (origin === 'search') assert(firstOrigin.state.query === 'termo preservado', `${label}: pesquisa não foi preservada.`);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
