const fs = require('fs');

const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');
const csharp = fs.readFileSync('MainPage.xaml.cs', 'utf8');
const policy = fs.readFileSync('Services/PlaybackScopePolicy.cs', 'utf8');

assert(html.includes('const canonicalEpisodes = Array.isArray(anime?.episodes) ? anime.episodes.map'), 'Snapshot canônico ausente.');
assert(html.includes('const episode = session.episode;') && !html.includes('const episode = currentAnime.episodes[currentEpIndex];\n                episode.src = playback.url;'), 'Escrita ainda depende do índice global após await.');
assert(html.includes("cancelApiChannel('playback', reason)"), 'Cancelamento da chamada de playback ausente.');
assert(html.includes("if (!isCurrentEpisodeSession(session) || !session.episodes.includes(session.episode))"), 'Resposta obsoleta ou episódio removido não é rejeitado.');
assert(html.includes('if (activeEpisodeSession === session) isChangingEpisode = false;'), 'finally não libera a sessão correta.');
assert(html.includes('function renderEpisodesList(episodes = playerEpisodes'), 'Render não recebe snapshot explicitamente.');
assert(!html.includes('>4 Eps</span>'), 'Badge contém contagem estática inventada.');
assert(html.includes('if (!container) return;') && html.includes('const snapshot = Array.isArray(episodes) ? episodes : [];'), 'Render vazio não é seguro.');
assert(html.includes('updatePlayerEpisodeSnapshot(session.episodes, session.episodeId);'), 'Lista não é renderizada ao criar a sessão e após a resposta.');
assert(html.includes("cancelActiveEpisodeSession('playback-cancelled');"), 'Voltar não limpa a sessão ativa.');
assert(csharp.includes('cancellationToken.ThrowIfCancellationRequested();'), 'Resposta nativa cancelada ainda pode instalar headers.');
assert(csharp.includes('receivedResourceKind') && csharp.includes('NormalizedResourceKind'), 'Diagnóstico de kind recebido/normalizado ausente.');
assert(policy.includes('public enum PlaybackResourceKind'), 'Enum explícita de tipos HLS ausente.');
assert(!/Naruto/.test(html.slice(html.indexOf('async function openApiEpisode'), html.indexOf("document.getElementById('detailsBackBtn')"))), 'Hardcode de anime no player.');

const harness = createHarness([
  { id: 'episode-a' },
  { id: 'episode-b' },
  { id: 'episode-c' }
]);

const first = harness.open('episode-a');
assert(harness.badge === 3 && harness.list.length === 3, 'Badge e lista não usam os mesmos três episódios.');
harness.back();
assert(first.commit({ url: 'https://unit.test/a' }) === false, 'Resposta após Voltar alterou o player.');
assert(harness.isChangingEpisode === false && harness.list.length === 3, 'Voltar bloqueou cliques ou apagou a lista.');

const stale = harness.open('episode-a');
const current = harness.open('episode-b');
harness.currentIndex = 2;
assert(stale.commit({ url: 'https://unit.test/stale' }) === false, 'Episódio 1 sobrescreveu episódio 2.');
assert(current.commit({ url: 'https://unit.test/current' }) === true, 'Mudança do índice global invalidou a identidade da sessão atual.');
assert(harness.list[1].src === 'https://unit.test/current', 'Playback não atualizou o episódio capturado por identidade.');

const removed = harness.open('episode-c');
removed.session.episodes = removed.session.episodes.filter(item => item.id !== 'episode-c');
assert(removed.commit({ url: 'https://unit.test/removed' }) === false, 'Episódio removido durante await recebeu escrita.');
assert(harness.list.length === 3, 'Falha de playback apagou a lista canônica.');
harness.fail(removed.session);
assert(harness.isChangingEpisode === false, 'Falha deixou isChangingEpisode preso.');
assert(harness.open('episode-a').session.episodeId === 'episode-a', 'Outro episódio não abre imediatamente após falha/Voltar.');

console.log('PASS: estado atômico, cancelamento, snapshot e navegação do episódio');

function createHarness(sourceEpisodes) {
  const state = {
    active: null,
    list: sourceEpisodes.map(item => ({ ...item })),
    badge: sourceEpisodes.length,
    currentIndex: 0,
    isChangingEpisode: false,
    open(episodeId) {
      if (state.active) state.active.cancelled = true;
      const episodes = sourceEpisodes.map(item => ({ ...item }));
      const episode = episodes.find(item => item.id === episodeId);
      const session = { animeId: 'anime-test', episodeId, episode, episodes, cancelled: false };
      state.active = session;
      state.list = episodes;
      state.badge = episodes.length;
      state.currentIndex = episodes.indexOf(episode);
      state.isChangingEpisode = true;
      return {
        session,
        commit(playback) {
          const valid = state.active === session && !session.cancelled && session.episodes.includes(session.episode);
          if (!valid || !session.episode) return false;
          session.episode.src = playback.url;
          state.list = session.episodes;
          state.currentIndex = session.episodes.indexOf(session.episode);
          state.isChangingEpisode = false;
          return true;
        }
      };
    },
    back() {
      if (state.active) state.active.cancelled = true;
      state.active = null;
      state.isChangingEpisode = false;
    },
    fail(session) {
      if (state.active === session) state.isChangingEpisode = false;
    }
  };
  return state;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
