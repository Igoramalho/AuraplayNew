const fs = require('fs');

const html = fs.readFileSync('Resources/Raw/auraplay.html', 'utf8');
const csharp = fs.readFileSync('MainPage.xaml.cs', 'utf8');

assert(html.includes('let playerExitPending = false;'), 'playerExitPending separado não existe.');
assert(html.includes('transitionPending: Boolean(playerExitPending || fullscreenTransitionPending || pipTransitionPending)'), 'transitionPending ainda usa a Promise como flag.');
assert(html.includes('playerExitPending = true;') && html.includes('playerExitPending = false;'), 'playerExitPending não tem ciclo completo.');
assert(html.includes("'player-exit-promise-created'") && html.includes("'player-exit-promise-cleared'"), 'Ciclo da Promise de saída não é diagnosticado.');

const pip = slice(html, 'async function setCustomPictureInPicture', "document.getElementById('pipBtn')");
assert(pip.includes('pipTransitionPending = true;') && pip.includes('pipTransitionPending = false;'), 'PiP não libera a flag.');
assert(pip.includes('finally') && pip.includes('pendingViewAfterPiP = null;'), 'PiP não limpa destino pendente no finally.');
for (const event of ['pip-transition-start', 'pip-transition-finally', 'pip-transition-cleared']) assert(pip.includes(`'${event}'`), `Evento ${event} ausente.`);
assert(html.includes('recoverStaleTransition') && html.includes("'stale-transition-detected'") && html.includes("'stale-transition-recovered'"), 'Recuperação de estado obsoleto ausente.');

const navigation = slice(html, 'function switchNav', 'function applyViewSwitch');
assert(navigation.includes('pendingNavigationRequest = transition') && navigation.includes("'navigation-deferred'"), 'Navegação adiada não guarda o destino.');
assert(html.includes("'navigation-resumed'") && html.includes('deferredNavigation'), 'Navegação adiada não é retomada.');
assert(html.includes('playerExitPending && playerExitPromise'), 'Saída não distingue estado pendente da Promise.');
assert(!html.includes('windowCommandPending || fullscreenTransitionPending || pipTransitionPending'), 'Comando de janela entrou no bloqueio de navegação.');

const diagnostics = slice(html, 'function reportPlayerLifecycle', 'function performCloseCleanup');
for (const field of ['playerExitPending', 'fullscreenPending', 'pipPending', 'windowCommandPending', 'pendingTargetView']) assert(diagnostics.includes(field), `Campo ${field} não é enviado.`);
for (const event of ['navigation-deferred', 'navigation-resumed', 'player-exit-promise-created', 'player-exit-promise-cleared']) assert(html.includes(`'${event}'`), `Diagnóstico ${event} ausente.`);
assert(csharp.includes('playerExitPending=') && csharp.includes('fullscreenPending=') && csharp.includes('pipPending='), 'C# não preserva flags separadas no diagnóstico.');
assert(!/url=|host=|headers?=/i.test(diagnostics), 'Diagnóstico de transição expõe dados de rede.');
assert(!/Naruto/.test(pip + navigation + diagnostics), 'Hardcode de Naruto na correção.');

console.log('PASS: transitionPending separado, PiP liberado e navegação adiada retomável');

function slice(text, start, end) {
  const from = text.indexOf(start); const to = text.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Bloco não localizado: ${start}`); return text.slice(from, to);
}
function assert(value, message) { if (!value) throw new Error(message); }
