const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');
const start = html.indexOf('const LEGACY_HISTORY_TITLES');
const end = html.indexOf('function decodeNativeWatchHistory', start);
if (start < 0 || end < 0) throw new Error('Funções de compatibilidade do histórico não foram localizadas.');

const catalogId = '6cf4eb6e-eedc-4257-878a-a53ae7d084e4';
const episodeId = '4e6f1a07-71ce-418d-8c7a-eea734d14045';
const context = {
    ANIME_DATABASE: [{
        id: catalogId,
        title: 'Solo Leveling',
        alternativeTitles: ['Ore dake Level Up na Ken'],
        apiManaged: true,
        episodes: [{ id: episodeId, number: 1, seasonId: 'season-uuid', available: true }]
    }],
    continueWatching: {},
    FALLBACK_COVER: 'fallback'
};
vm.createContext(context);
vm.runInContext(`${html.slice(start, end)};globalThis.hooks={normalizeHistoryIdentity,historyIdentityValues,isApiUuid,getHistoryTitle,resolveHistoryAnime,resolveHistoryEpisode,createHistoryAnimeSnapshot,deduplicateHistoryItems};`, context);

const oldRecord = { animeId: '1', epIndex: 0, episodeNumber: 1, position: 20, duration: 100, lastPlayedAt: 10, completed: false };
const newRecord = { catalogId, animeId: catalogId, episodeId, episodeNumber: 1, position: 40, duration: 100, lastPlayedAt: 20, completed: false };

assert(context.hooks.resolveHistoryAnime(oldRecord)?.id === catalogId, 'ID textual antigo não foi resolvido para o UUID atual.');
assert(context.hooks.resolveHistoryAnime(newRecord)?.id === catalogId, 'UUID atual não foi resolvido diretamente.');
assert(context.hooks.resolveHistoryEpisode(context.ANIME_DATABASE[0], newRecord)?.id === episodeId, 'UUID do episódio não teve prioridade.');
assert(context.hooks.resolveHistoryEpisode(context.ANIME_DATABASE[0], oldRecord)?.id === episodeId, 'Fallback antigo por número/índice falhou.');

context.continueWatching = { legacy: oldRecord, [catalogId]: newRecord };
const deduplicated = context.hooks.deduplicateHistoryItems();
assert(deduplicated.length === 1 && deduplicated[0] === newRecord, 'Continue Watching não manteve somente o registro canônico mais recente.');

const detachedRecord = { catalogId: '11111111-1111-4111-8111-111111111111', animeTitle: 'Fora da Home', animePoster: 'cover' };
const snapshot = context.hooks.createHistoryAnimeSnapshot(detachedRecord);
assert(snapshot?.apiManaged === true && snapshot.title === 'Fora da Home', 'Snapshot compatível de UUID fora da Home falhou.');

console.log('PASS: compatibilidade de histórico textual, UUID e Continue Watching');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
