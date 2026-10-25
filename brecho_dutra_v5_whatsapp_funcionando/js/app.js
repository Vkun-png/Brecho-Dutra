/* Lógica do Brechó Dutra - voz, peças, cálculo e WhatsApp */
'use strict';

// 1. Armazenamento local: a lista continua lá se a página for fechada.
const STORAGE_KEY = 'brecho-dutra-consignado-v1';
const $ = (selector) => document.querySelector(selector);
const formatBRL = (cents) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL'
}).format(cents / 100);

let items = [];
let editingId = null;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      items,
      supplierName: $('#supplierName').value
    }));
  } catch (err) {
    console.warn('O navegador não permitiu salvar os dados:', err);
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (Array.isArray(saved.items)) {
      items = saved.items.filter((item) =>
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        Number.isSafeInteger(item.cents) && item.cents > 0
      );
    }
    $('#supplierName').value = typeof saved.supplierName === 'string' ? saved.supplierName : '';
  } catch (err) {
    items = [];
  }
}

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// O centavo eventualmente indivisível vai para a fornecedora.
function split(cents) {
  const store = Math.floor(cents / 2);
  return { store, supplier: cents - store };
}

function addItem(name, cents) {
  items.push({ id: makeId(), name: name.trim(), cents });
  save();
  render();
}

function svgIcon(type) {
  const paths = type === 'trash'
    ? '<path d="M3 6h18m-2 0-1 14H6L5 6m3 0V4h8v2m-6 4v7m4-7v7"/>'
    : '<path d="M12 20h9M16 4l4 4-11 11-4 1 1-4L16 4Z"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// 2. Atualiza a lista e todos os totais a partir dos dados reais.
function render() {
  const list = $('#items');
  list.replaceChildren();
  $('#empty').hidden = items.length > 0;
  $('#count').textContent = `${items.length} ${items.length === 1 ? 'peça' : 'peças'}`;
  updateShareLinks();

  for (const item of items) {
    const values = split(item.cents);
    const card = document.createElement('article');
    card.className = 'item';
    // O nome digitado NÃO é inserido como HTML, para evitar código malicioso.
    card.innerHTML = `
      <div class="item-topo">
        <h3 class="item-nome"></h3>
        <strong class="item-valor"></strong>
        <div class="icones">
          <button type="button" class="icone-btn edit" aria-label="Editar peça">${svgIcon('edit')}</button>
          <button type="button" class="icone-btn delete" aria-label="Excluir peça">${svgIcon('trash')}</button>
        </div>
      </div>
      <div class="divisao">
        <div class="parte"><small>Brechó (50%)</small><strong class="valor-brecho"></strong></div>
        <div class="parte fornecedora"><small>Fornecedora (50%)</small><strong class="valor-fornecedora"></strong></div>
      </div>`;
    card.querySelector('.item-nome').textContent = item.name;
    card.querySelector('.item-valor').textContent = formatBRL(item.cents);
    card.querySelector('.valor-brecho').textContent = formatBRL(values.store);
    card.querySelector('.valor-fornecedora').textContent = formatBRL(values.supplier);
    card.querySelector('.edit').addEventListener('click', () => openDialog(item.id));
    card.querySelector('.delete').addEventListener('click', () => {
      items = items.filter((x) => x.id !== item.id);
      save(); render();
      feedback(`Peça “${item.name}” excluída.`);
    });
    list.appendChild(card);
  }

  const totals = items.reduce((acc, item) => {
    const values = split(item.cents);
    acc.general += item.cents;
    acc.store += values.store;
    acc.supplier += values.supplier;
    return acc;
  }, { general: 0, store: 0, supplier: 0 });
  $('#total').textContent = formatBRL(totals.general);
  $('#storeTotal').textContent = formatBRL(totals.store);
  $('#supplierTotal').textContent = formatBRL(totals.supplier);
}

function feedback(message) { $('#feedback').textContent = message; }

// 3. O reconhecimento de voz costuma produzir números em algarismos,
// mas também pode transcrever "quinze" ou "vinte e cinco" por extenso.
const UNITS = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4,
  cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
  quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19
};
const TENS = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const HUNDREDS = { cem: 100, cento: 100, duzentos: 200, duzentas: 200,
  trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800,
  novecentos: 900, novecentas: 900 };

function normalize(word) {
  return (word || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function wordValue(word) {
  const w = normalize(word);
  if (Object.hasOwn(UNITS, w)) return UNITS[w];
  if (Object.hasOwn(TENS, w)) return TENS[w];
  if (Object.hasOwn(HUNDREDS, w)) return HUNDREDS[w];
  return null;
}
const isWord = (w) => wordValue(w) !== null;

// Lê sequências como "trinta e cinco" e "cento e vinte".
function readNumberWords(tokens, from) {
  if (!isWord(tokens[from])) return null;
  let value = wordValue(tokens[from]);
  let i = from + 1;
  while (normalize(tokens[i]) === 'e' && isWord(tokens[i + 1])) {
    const next = wordValue(tokens[i + 1]);
    // "vinte e cinquenta" normalmente indica R$ 20,50, não R$ 70.
    if (value < 100 && next >= 20 && next < 100) break;
    if (value < 20 && next >= 20) break;
    if (value % 10 !== 0 && next < 10 && value < 100) break;
    if (value >= 100 && next >= 100) break;
    value += next;
    i += 2;
  }
  return { value, end: i };
}

// Converte campo manual ou token numérico para CENTAVOS, sem strings monetárias.
function parseNumericMoney(raw) {
  const clean = String(raw).replace(/^r\$\s*/i, '').trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(clean)) return null;
  const [whole, decimals = ''] = clean.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function amountAt(tokens, at) {
  const token = tokens[at];
  if (!token) return null;
  let whole = 0;
  let cents = 0;
  let next = at;
  let decimalAlreadyPresent = false;
  if (/^(?:r\$\s*)?\d+(?:[.,]\d{1,2})?$/i.test(token)) {
    const numeric = parseNumericMoney(token);
    if (numeric === null) return null;
    whole = Math.floor(numeric / 100);
    cents = numeric % 100;
    decimalAlreadyPresent = /[.,]/.test(token);
    next = at + 1;
  } else {
    const parsed = readNumberWords(tokens, at);
    if (!parsed) return null;
    whole = parsed.value;
    next = parsed.end;
  }

  // "15 reais e 50 centavos", "15 e cinquenta", "quinze e cinquenta".
  if (['real', 'reais'].includes(normalize(tokens[next]))) next++;
  if (!decimalAlreadyPresent && normalize(tokens[next]) === 'e') {
    const numeric = /^\d{1,2}$/.test(tokens[next + 1] || '')
      ? { value: Number(tokens[next + 1]), end: next + 2 }
      : readNumberWords(tokens, next + 1);
    if (numeric && numeric.value >= 0 && numeric.value < 100) {
      cents = numeric.value;
      next = numeric.end;
      if (['centavo', 'centavos'].includes(normalize(tokens[next]))) next++;
    }
  }
  if (['centavo', 'centavos'].includes(normalize(tokens[next]))) next++;
  const finalCents = whole * 100 + cents;
  if (!Number.isSafeInteger(finalCents) || finalCents <= 0) return null;
  return { cents: finalCents, end: next };
}

function cleanName(text) {
  return text
    .replace(/^[\s,.;:!]+|[\s,.;:!]+$/g, '')
    .replace(/^(?:(?:e|mais|uma|um)\s+)+/i, '')
    .replace(/(?:^|\s)(?:por|de|a|vale|custa|preco|preço|no valor de)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function parseSpeech(transcript) {
  // Uma única fala pode conter diversas peças, sem precisar ditar vírgulas.
  const tokens = transcript.match(/r\$\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?|[\p{L}]+(?:-[\p{L}]+)?|[,;:.]/giu) || [];
  const found = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    const amount = amountAt(tokens, i);
    if (!amount) continue;
    const name = cleanName(tokens.slice(start, i).join(' '));
    if (!name) continue;
    found.push({ name, cents: amount.cents });
    i = amount.end - 1;
    start = amount.end;
  }
  return { found, leftover: cleanName(tokens.slice(start).join(' ')) };
}

function consumeSpeech(transcript) {
  const { found, leftover } = parseSpeech(transcript);
  if (!found.length) {
    feedback(`Não identifiquei nome + valor. Ouvi: “${transcript}”. Tente outra vez ou adicione manualmente.`);
    return;
  }
  for (const item of found) addItem(item.name, item.cents);
  const msg = `${found.length} ${found.length === 1 ? 'peça adicionada' : 'peças adicionadas'}!`;
  feedback(leftover ? `${msg} Confira a fala: “${leftover}” ficou sem valor.` : `${msg} Confira os valores abaixo.`);
}

// 4. VOZ EM MODO MÃOS LIVRES
// O Chrome/Android pode encerrar uma sessão de reconhecimento após silêncio,
// mesmo com continuous=true. Por isso, cada "ciclo" terminado inicia outro
// automaticamente, até a pessoa tocar em parar (ou ditar um comando de parada).
// IMPORTANTE: a Web Speech API não garante áudio ininterrupto; há uma pequena
// pausa durante a reconexão e a captura depende do serviço do navegador.
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceSession = null;

const FATAL_SPEECH_ERRORS = new Set([
  'not-allowed', 'service-not-allowed', 'audio-capture',
  'language-not-supported', 'language-unavailable'
]);

function openDictation() {
  $('#dictationPanel').hidden = false;
  $('#dictationToggle').setAttribute('aria-expanded', 'true');
}

function setMicState(state) {
  const mic = $('#micButton');
  mic.classList.toggle('ouvindo', state === 'listening' || state === 'restarting');
  mic.classList.toggle('conectando', state === 'starting');
  mic.classList.toggle('finalizando', state === 'stopping');
  mic.setAttribute('aria-pressed', String(state !== 'idle'));
  const labels = {
    idle: ['Toque para começar a avaliação', 'Iniciar escuta mãos livres'],
    starting: ['Ativando o microfone… toque para parar', 'Parar escuta'],
    listening: ['Mãos livres ativo • toque para parar', 'Encerrar escuta'],
    restarting: ['Pausa detectada • reconectando…', 'Encerrar escuta'],
    stopping: ['Finalizando…', 'Finalizando escuta']
  };
  $('#micLabel').textContent = labels[state][0];
  mic.setAttribute('aria-label', labels[state][1]);
  $('#handsFreeStatus').hidden = state === 'idle';
}

function speechErrorMessage(code) {
  const errors = {
    'not-allowed': 'Microfone bloqueado. Nas permissões do site, autorize o microfone e tente novamente.',
    'service-not-allowed': 'O Chrome bloqueou o serviço de reconhecimento de voz.',
    'audio-capture': 'Não foi possível acessar o microfone. Feche outros aplicativos que possam estar usando o áudio.',
    'network': 'Problema na conexão do reconhecimento de voz. Verifique a internet e tente novamente.',
    'language-not-supported': 'O reconhecimento em português não está disponível neste navegador.',
    'language-unavailable': 'O pacote de voz em português não está disponível no aparelho.',
    'start-timeout': 'O microfone não respondeu. Abra o site em HTTPS no Chrome e verifique a permissão.',
    'aborted': 'O reconhecimento foi interrompido.'
  };
  return errors[code] || `Falha no reconhecimento de voz (${code || 'desconhecida'}).`;
}

// Mantém a tela do Android acesa enquanto a avaliação estiver em andamento,
// se a pessoa ativou a opção e o navegador suporta Screen Wake Lock.
async function holdScreenOn(session) {
  if (!session.active || !$('#keepScreenOn').checked || document.visibilityState !== 'visible') return;
  if (!navigator.wakeLock || session.wakeLock || session.wakePending) return;
  session.wakePending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!session.active || !$('#keepScreenOn').checked || document.visibilityState !== 'visible') {
      await lock.release();
    } else {
      session.wakeLock = lock;
      lock.addEventListener('release', () => {
        if (session.wakeLock === lock) session.wakeLock = null;
      });
    }
  } catch (error) {
    // Falha não deve impedir a captura: economia de bateria pode negar o lock.
    console.info('Não foi possível manter a tela ligada:', error);
  } finally {
    session.wakePending = false;
  }
}

function releaseScreenLock(session) {
  if (!session.wakeLock) return;
  const lock = session.wakeLock;
  session.wakeLock = null;
  lock.release().catch(() => {});
}

function clearVoiceTimers(session) {
  clearTimeout(session.restartTimer);
  clearTimeout(session.stopTimer);
  session.restartTimer = null;
  session.stopTimer = null;
}

// SEGURANÇA FINANCEIRA: o Chrome repete/revisa transcrições e a sessão pode
// recomeçar após pausas. Nunca lance uma transcrição provisória como peça.
// Esta camada preserva apenas falas FINALIZADAS, bloqueia ecos e trata nomes
// pendentes sem concatenar duas peças diferentes por engano.
const CLOTHING_START = /^(?:(?:e|mais|um|uma|outro|outra|segunda|segundo)\s+)*(?:blusa|calca|camisa|camiseta|vestido|saia|short|bermuda|casaco|jaqueta|body|cropped|top|regata|macacao|conjunto|calçado|sapato|tenis|sandalia|bolsa|pijama|legging|moletom|cardiga|kimono|biquini|maio)\b/i;
const CLOTHING_WORDS = new Set(['blusa', 'calca', 'camisa', 'camiseta', 'vestido', 'saia', 'short', 'bermuda', 'casaco', 'jaqueta', 'body', 'cropped', 'top', 'regata', 'macacao', 'conjunto', 'sapato', 'tenis', 'sandalia', 'bolsa', 'pijama', 'legging', 'moletom', 'cardiga', 'kimono', 'biquini', 'maio']);
const MAX_PENDING_WORDS = 7;
const DUPLICATE_COMMAND_COOLDOWN_MS = 10000;

function normalizedPhrase(text) {
  return normalize(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function voiceItemKey(item) {
  return `${normalizedPhrase(item.name)}|${item.cents}`;
}
function hasSuspiciousName(name) {
  const words = normalizedPhrase(name).split(' ');
  // Ex.: "blusa blusa branca" ou "calça preta blusa branca":
  // normalmente sinalizam falas antigas misturadas.
  const kinds = words.filter((word) => CLOTHING_WORDS.has(word));
  return kinds.length > 1 || words.length > 10;
}
function combineVoicePieces(pending, incoming) {
  if (!pending) return incoming;
  // Se uma fala nova já contém peça + preço, descarte um nome pendente antigo.
  // Ex.: pendente "calça" + novo "blusa branca doze" => somente blusa branca.
  if (CLOTHING_START.test(normalize(incoming)) && parseSpeech(incoming).found.length) {
    return incoming;
  }
  const a = normalizedPhrase(pending).split(' ');
  const b = normalizedPhrase(incoming).split(' ');
  if (a.join(' ') === b.slice(0, a.length).join(' ')) return incoming;
  // Trata reconhecimento incremental: "blusa branca" + "branca doze".
  for (let length = Math.min(a.length, b.length); length >= 1; length--) {
    if (a.slice(-length).join(' ') === b.slice(0, length).join(' ')) {
      return `${pending} ${incoming.split(/\s+/).slice(length).join(' ')}`.trim();
    }
  }
  return `${pending} ${incoming}`;
}

// Comando para peças REALMENTE iguais, evitando bloquear uma duplicação
// deliberada. Pode dizer "outra igual" ou "outra blusa branca doze".
function explicitlyRepeated(raw) {
  return /^(?:mais\s+um(?:a)?|outr[ao]|segund[ao]|repetir)\b/i.test(normalize(raw));
}
function repeatLastItem(session) {
  if (!session.lastAccepted) {
    feedback('Para repetir uma peça, primeiro diga o nome e o preço dela.');
    return;
  }
  const { name, cents } = session.lastAccepted;
  addItem(name, cents);
  session.added += 1;
  feedback(`Outra peça igual registrada: ${name}, ${formatBRL(cents)}. Total nesta avaliação: ${session.added}.`);
}
function appendRecognizedText(session, rawText) {
  const raw = (rawText || '').trim();
  if (!raw || !session.active) return;
  const stopCommand = /\b(?:parar (?:a )?(?:escuta|gravacao|gravação|microfone|de ouvir)|encerrar (?:a )?(?:escuta|gravacao|gravação)|finalizar (?:a )?(?:escuta|gravacao|gravação))\s*[.!?]*$/i;
  const normalizedRaw = normalize(raw);
  const voiceStop = stopCommand.exec(normalizedRaw);
  const text = voiceStop ? raw.slice(0, voiceStop.index).trim() : raw;
  const phrase = normalizedPhrase(text);

  if (text && phrase) {
    const now = Date.now();
    const lastTime = session.seenPhrases.get(phrase);
    const isDuplicateCommand = /^(?:(?:outra|mais uma|mais um|repetir)\s+)?igual(?:\s+a\s+anterior)?$/i.test(phrase) || /^(?:outra|mais uma|mais um|repetir)(?:\s+peca)?(?:\s+igual)?$/i.test(phrase);
    // Sem comando explícito, a mesma fala completa só é processada uma vez
    // por avaliação, inclusive quando vem de outra instância da API.
    // Com "outra igual", é permitido repetir, mas não imediatamente por eco.
    if (lastTime !== undefined && (!isDuplicateCommand || now - lastTime < DUPLICATE_COMMAND_COOLDOWN_MS)) {
      session.ignoredRepeats++;
      feedback(`Proteção ativa: ignorei ${session.ignoredRepeats} repetição(ões) do reconhecimento. ${session.added} peça(s) registrada(s).`);
    } else {
      session.seenPhrases.set(phrase, now);
      if (isDuplicateCommand) {
        repeatLastItem(session);
      } else {
        // Expressões como "outra blusa branca doze" indicam uma nova peça
        // idêntica, mas não fazem parte do nome comercial da peça.
        const itemText = text.replace(/^(?:mais\s+um(?:a)?|outr[ao]|segund[ao])\s+/i, '');
        const combined = combineVoicePieces(session.pending, itemText);
        const { found, leftover } = parseSpeech(combined);
        session.pending = leftover.split(/\s+/).length > MAX_PENDING_WORDS ? '' : leftover;
        if (!found.length) {
          feedback(`Ouvi: “${text}”. Continue com o preço da peça.`);
        } else {
          let added = 0;
          let repeated = 0;
          let suspicious = 0;
          const allowEqual = explicitlyRepeated(text);
          for (const item of found) {
            if (hasSuspiciousName(item.name)) {
              suspicious++;
              continue;
            }
            const key = voiceItemKey(item);
            if (session.acceptedVoiceKeys.has(key) && !allowEqual) {
              repeated++;
              session.ignoredRepeats++;
              continue;
            }
            addItem(item.name, item.cents);
            session.acceptedVoiceKeys.add(key);
            session.lastAccepted = { name: item.name, cents: item.cents };
            session.added++;
            added++;
          }
          session.restartFailures = 0;
          if (suspicious || repeated) {
            feedback(`${added} nova(s) peça(s). ${repeated} repetição(ões) ignorada(s) e ${suspicious} nome(s) confuso(s) descartado(s). Para cadastrar outra igual, diga “outra igual”.`);
          } else if (added) {
            feedback(`${session.added} ${session.added === 1 ? 'peça registrada' : 'peças registradas'} nesta avaliação. Continue falando; pode fazer pausas.`);
          }
        }
      }
    }
  }
  if (voiceStop) stopVoiceSession(session);
}

function finishVoiceSession(session, message = '') {
  if (voiceSession !== session || !session.active) return;
  // Resultados provisórios NÃO são peças; são revisões do Chrome e podem
  // repetir uma fala anterior. Só resultados com isFinal=true são registrados.
  session.active = false;
  session.wantsListening = false;
  clearVoiceTimers(session);
  if (session.cycle) {
    const cycle = session.cycle;
    session.cycle = null;
    clearTimeout(cycle.startTimer);
    clearTimeout(cycle.audioEndTimer);
    clearTimeout(cycle.errorTimer);
    try { cycle.engine.abort(); } catch (error) { /* já encerrado */ }
  }
  releaseScreenLock(session);
  voiceSession = null;
  setMicState('idle');
  if (session.pending) {
    // Sem valor, não é possível lançar peça. Pode revisar no ditado manual.
    const field = $('#dictationText');
    field.value = [field.value.trim(), session.pending].filter(Boolean).join('\n');
    message += ` Ficou sem preço: “${session.pending}” (guardado no ditado manual).`;
  }
  feedback(message || `Escuta encerrada. ${session.added} ${session.added === 1 ? 'peça registrada' : 'peças registradas'}.`);
}

function stopVoiceSession(session) {
  if (!session || voiceSession !== session || !session.active) return;
  if (session.stopping) return;
  session.stopping = true;
  session.wantsListening = false; // IMPORTANTE: impede qualquer reinício.
  clearTimeout(session.restartTimer);
  session.restartTimer = null;
  setMicState('stopping');
  feedback('Encerrando a escuta e salvando as peças…');
  if (!session.cycle) {
    finishVoiceSession(session);
    return;
  }
  try { session.cycle.engine.stop(); }
  catch (error) { finishVoiceSession(session); return; }
  // Alguns Androids não disparam onend após stop(). Não deixar travado.
  session.stopTimer = setTimeout(() => finishVoiceSession(session), 2800);
}

function scheduleNextCycle(session, delay = 400) {
  if (!session.active || !session.wantsListening || session.stopping) return;
  if (document.visibilityState === 'hidden') {
    finishVoiceSession(session, 'A escuta foi encerrada ao sair do aplicativo. Deixe a tela aberta durante a avaliação.');
    return;
  }
  setMicState('restarting');
  feedback(`Pausa detectada. Reativando o microfone automaticamente… ${session.added} peça(s) registrada(s).`);
  clearTimeout(session.restartTimer);
  session.restartTimer = setTimeout(() => {
    session.restartTimer = null;
    if (voiceSession === session && session.active && session.wantsListening) startVoiceCycle(session);
  }, delay);
}

function finishVoiceCycle(session, cycle) {
  if (!session.active || session.cycle !== cycle || cycle.ended) return;
  cycle.ended = true;
  clearTimeout(cycle.startTimer);
  clearTimeout(cycle.audioEndTimer);
  clearTimeout(cycle.errorTimer);
  session.cycle = null;

  // Nunca aproveite o resultado provisório em onend: o Android pode enviar
  // fragmentos antigos ou uma hipótese parcial sem preço.
  cycle.interim = '';
  if (!session.active) return;
  if (!session.wantsListening || session.stopping) {
    finishVoiceSession(session);
    return;
  }
  if (cycle.fatal) {
    finishVoiceSession(session, speechErrorMessage(cycle.fatal));
    return;
  }
  if (cycle.error === 'network' || cycle.error === 'start-timeout') {
    session.restartFailures++;
    if (session.restartFailures >= 3) {
      finishVoiceSession(session, speechErrorMessage(cycle.error));
      return;
    }
    scheduleNextCycle(session, session.restartFailures * 1200);
  } else {
    // 'no-speech' e encerramento normal são pausas, NÃO comandos de parada.
    scheduleNextCycle(session, 350);
  }
}

function startVoiceCycle(session) {
  if (voiceSession !== session || !session.active || !session.wantsListening || session.cycle) return;
  if (document.visibilityState === 'hidden') {
    finishVoiceSession(session, 'O app foi para segundo plano. Deixe-o aberto para usar a voz.');
    return;
  }
  const engine = new SpeechRecognition();
  engine.lang = 'pt-BR';
  engine.continuous = true; // Mantém aberto quando possível; reinicia em pausas.
  engine.interimResults = true;
  engine.maxAlternatives = 1;
  const cycle = {
    engine, ended: false, started: false, seen: new Set(), interim: '', error: '', fatal: '',
    startTimer: null, audioEndTimer: null, errorTimer: null
  };
  session.cycle = cycle;
  setMicState(session.hasStarted ? 'restarting' : 'starting');

  engine.onstart = () => {
    if (session.cycle !== cycle || !session.active) return;
    session.hasStarted = true;
    cycle.started = true;
    clearTimeout(cycle.startTimer);
    setMicState(session.stopping ? 'stopping' : 'listening');
    if (!session.stopping) feedback(`Mãos livres ativo! Dite a peça e o valor; pode fazer pausas. Já são ${session.added} peça(s).`);
  };
  engine.onaudiostart = () => {
    clearTimeout(cycle.startTimer);
    if (session.cycle === cycle && !session.stopping) setMicState('listening');
  };
  engine.onresult = (event) => {
    if (session.cycle !== cycle || !session.active || cycle.ended) return;
    let interim = '';
    // O navegador pode repetir o array inteiro em cada evento.
    // Processamos apenas índices finais inéditos deste ciclo.
    const from = Math.max(0, Number.isInteger(event.resultIndex) ? event.resultIndex : 0);
    for (let i = from; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result || !result[0]) continue;
      const text = (result[0].transcript || '').trim();
      if (!text) continue;
      if (result.isFinal) {
        if (!cycle.seen.has(i)) {
          cycle.seen.add(i);
          appendRecognizedText(session, text);
          session.restartFailures = 0;
        }
      } else {
        interim += `${text} `;
      }
    }
    cycle.interim = interim.trim();
    if (session.active && cycle.interim && !session.stopping) {
      feedback(`Ouvindo: “${cycle.interim}” — ${session.added} peça(s) salva(s).`);
    }
  };
  engine.onaudioend = () => {
    // Normalmente onend vem em seguida. Se não vier, recupera o ciclo.
    clearTimeout(cycle.audioEndTimer);
    cycle.audioEndTimer = setTimeout(() => {
      if (session.cycle === cycle && !cycle.ended) {
        try { engine.abort(); } catch (error) { /* já parado */ }
        finishVoiceCycle(session, cycle);
      }
    }, 4500);
  };
  engine.onerror = (event) => {
    if (session.cycle !== cycle || !session.active || cycle.ended) return;
    cycle.error = event.error || 'unknown';
    if (FATAL_SPEECH_ERRORS.has(cycle.error)) cycle.fatal = cycle.error;
    // Em falhas graves, alguns aparelhos não enviam onend; forçar encerramento.
    clearTimeout(cycle.errorTimer);
    cycle.errorTimer = setTimeout(() => {
      if (session.cycle === cycle && !cycle.ended) {
        try { engine.abort(); } catch (error) { /* já parado */ }
        finishVoiceCycle(session, cycle);
      }
    }, 1800);
  };
  engine.onend = () => finishVoiceCycle(session, cycle);

  try { engine.start(); }
  catch (error) {
    cycle.error = 'start-timeout';
    finishVoiceCycle(session, cycle);
    return;
  }
  // Se nem onstart, onaudiostart, onend ou onerror chegarem, tente recuperar.
  cycle.startTimer = setTimeout(() => {
    if (session.cycle === cycle && !cycle.ended && !cycle.started) {
      cycle.error = 'start-timeout';
      try { engine.abort(); } catch (error) { /* já parado */ }
      finishVoiceCycle(session, cycle);
    }
  }, 10000);
}

function startVoiceSession() {
  if (!SpeechRecognition) {
    feedback('Este navegador não oferece reconhecimento de voz. Use o microfone do teclado abaixo.');
    openDictation();
    return;
  }
  if (!window.isSecureContext) {
    feedback('O microfone precisa de HTTPS. Abra o site publicado no Chrome, não o arquivo HTML diretamente.');
    openDictation();
    return;
  }
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (policy && typeof policy.allowsFeature === 'function' && !policy.allowsFeature('microphone')) {
    feedback('Esta visualização bloqueia o microfone. Abra o site diretamente no Google Chrome.');
    openDictation();
    return;
  }
  const session = {
    active: true, wantsListening: true, stopping: false, hasStarted: false,
    cycle: null, pending: '', lastHeard: '', added: 0, restartFailures: 0,
    // Antirrepetição persiste mesmo quando uma sessão de reconhecimento termina.
    seenPhrases: new Map(), acceptedVoiceKeys: new Set(),
    ignoredRepeats: 0, lastAccepted: null,
    restartTimer: null, stopTimer: null, wakeLock: null, wakePending: false
  };
  voiceSession = session;
  setMicState('starting');
  feedback('Ativando o modo mãos livres. Permita o microfone se aparecer uma solicitação.');
  // A chamada de start() deve acontecer imediatamente após o toque do usuário.
  startVoiceCycle(session);
  holdScreenOn(session);
}

$('#micButton').addEventListener('click', () => {
  if (voiceSession) stopVoiceSession(voiceSession);
  else startVoiceSession();
});

$('#keepScreenOn').addEventListener('change', () => {
  if (!voiceSession) return;
  if ($('#keepScreenOn').checked) holdScreenOn(voiceSession);
  else releaseScreenLock(voiceSession);
});

document.addEventListener('visibilitychange', () => {
  if (!voiceSession) return;
  if (document.visibilityState === 'hidden') {
    // Sites comuns não podem continuar reconhecendo voz de forma confiável em background.
    finishVoiceSession(voiceSession, 'Escuta pausada ao sair do aplicativo. Volte ao app e toque no microfone para continuar.');
  } else {
    holdScreenOn(voiceSession);
  }
});

// Fallback: o usuário usa o microfone nativo do teclado ou digita a frase.
$('#dictationToggle').addEventListener('click', () => {
  const panel = $('#dictationPanel');
  panel.hidden = !panel.hidden;
  $('#dictationToggle').setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) $('#dictationText').focus();
});
$('#dictationAdd').addEventListener('click', () => {
  const text = $('#dictationText').value.trim();
  if (!text) {
    feedback('Dite ou digite pelo menos uma peça com seu valor.');
    $('#dictationText').focus();
    return;
  }
  const parsed = parseSpeech(text);
  if (!parsed.found.length) {
    feedback('Não identifiquei nome e valor nessa frase. Exemplo: blusa vermelha quinze.');
    return;
  }
  consumeSpeech(text);
  // Preserva trechos não processados para que possam ser corrigidos.
  $('#dictationText').value = parsed.leftover || '';
});
window.addEventListener('pagehide', () => {
  if (voiceSession) finishVoiceSession(voiceSession, 'A escuta foi encerrada ao sair do aplicativo.');
});
if (!SpeechRecognition) {
  feedback('Seu navegador não suporta a Web Speech API. Você pode usar o microfone do teclado do celular logo abaixo.');
  openDictation();
}

// 5. Inclusão e edição manual, inclusive para corrigir um erro de voz.
function openDialog(id = null) {
  editingId = id;
  const existing = items.find((item) => item.id === id);
  $('#dialogTitle').textContent = existing ? 'Editar peça' : 'Adicionar peça';
  $('#itemName').value = existing ? existing.name : '';
  $('#itemPrice').value = existing ? (existing.cents / 100).toFixed(2).replace('.', ',') : '';
  $('#formError').textContent = '';
  $('#itemDialog').showModal();
  $('#itemName').focus();
}
$('#addButton').addEventListener('click', () => openDialog());
$('#cancelButton').addEventListener('click', () => $('#itemDialog').close());
$('#itemForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#itemName').value.trim();
  const cents = parseNumericMoney($('#itemPrice').value);
  if (!name) { $('#formError').textContent = 'Informe o nome da peça.'; return; }
  if (cents === null) { $('#formError').textContent = 'Digite um valor válido, como 15 ou 15,50.'; return; }
  if (editingId) {
    const item = items.find((x) => x.id === editingId);
    if (item) { item.name = name; item.cents = cents; }
    save(); render();
    feedback('Peça atualizada.');
  } else {
    addItem(name, cents);
    feedback('Peça adicionada manualmente.');
  }
  $('#itemDialog').close();
});
$('#supplierName').addEventListener('input', () => {
  save();
  updateShareLinks();
});

$('#clearButton').addEventListener('click', () => {
  if (!items.length) { feedback('A lista já está vazia.'); return; }
  if (!window.confirm('Apagar todas as peças e começar um novo consignado?')) return;
  items = [];
  $('#supplierName').value = '';
  save(); render();
  feedback('Lista limpa. Pode começar um novo consignado.');
});

// 6. Relatório e compartilhamento — Android, WhatsApp e alternativa manual.
// Evita window.open(): janelas novas podem ser bloqueadas no Chrome/PWA Android.
// O link direto é atualizado sempre que uma peça ou o nome da fornecedora muda.
function buildWhatsappReport() {
  const person = $('#supplierName').value.trim();
  const lines = ['*Consignado Brechó Dutra*'];
  if (person) lines.push(`*Fornecedora:* ${person}`);
  lines.push('');
  for (const [index, item] of items.entries()) {
    const values = split(item.cents);
    lines.push(`${index + 1}. *${item.name}*: ${formatBRL(item.cents)} (Brechó ${formatBRL(values.store)} / Fornecedora ${formatBRL(values.supplier)})`);
  }
  const total = items.reduce((n, item) => n + item.cents, 0);
  const storeTotal = items.reduce((n, item) => n + split(item.cents).store, 0);
  lines.push('', `*Total geral:* ${formatBRL(total)}`,
    `*Total Brechó Dutra:* ${formatBRL(storeTotal)}`,
    `*Total Fornecedora:* ${formatBRL(total - storeTotal)}`);
  return lines.join('\n');
}

function setShareFeedback(message) {
  $('#shareFeedback').textContent = message;
}

function updateShareLinks() {
  const hasItems = items.length > 0;
  const link = $('#whatsappButton');
  link.setAttribute('aria-disabled', String(!hasItems));
  link.tabIndex = hasItems ? 0 : -1;
  link.href = hasItems ? `https://wa.me/?text=${encodeURIComponent(buildWhatsappReport())}` : '#';
  $('#copyShareButton').disabled = !hasItems;
  $('#androidShareButton').disabled = !hasItems;
}

function openShareDialog(text, message) {
  $('#shareText').value = text;
  setShareFeedback(message || 'Selecione o texto e copie para o WhatsApp.');
  const dialog = $('#shareDialog');
  if (!dialog.open) dialog.showModal();
  $('#shareText').focus();
  $('#shareText').select();
}

// Aciona o compartilhamento nativo dentro do clique, mantendo a permissão de gesto.
function shareWithAndroid(text) {
  if (typeof navigator.share !== 'function') {
    openShareDialog(text, 'Compartilhamento indisponível. Selecione e copie o relatório.');
    return;
  }
  try {
    const operation = navigator.share({ title: 'Consignado Brechó Dutra', text });
    Promise.resolve(operation).then(() => {
      setShareFeedback('Relatório enviado ao menu de compartilhamento. Confira o envio no WhatsApp.');
    }).catch((error) => {
      if (error && error.name === 'AbortError') {
        setShareFeedback('Compartilhamento cancelado. Você pode tentar novamente.');
        return;
      }
      openShareDialog(text, 'O Android não conseguiu compartilhar. Copie a mensagem abaixo.');
    });
  } catch (error) {
    openShareDialog(text, 'O Android não conseguiu compartilhar. Copie a mensagem abaixo.');
  }
}

// Um link normal usa a MESMA aba em vez de window.open('_blank').
// Para relatórios grandes, usamos o menu nativo para evitar URLs enormes.
$('#whatsappButton').addEventListener('click', (event) => {
  if (!items.length) {
    event.preventDefault();
    return;
  }
  save();
  const link = $('#whatsappButton');
  if (link.href.length > 6500) {
    event.preventDefault();
    shareWithAndroid(buildWhatsappReport());
    return;
  }
  setShareFeedback('Abrindo WhatsApp… Se não abrir, use “Compartilhar pelo Android” ou “Copiar mensagem”.');
  // Sem preventDefault: a navegação direta é iniciada pelo próprio navegador.
});

$('#androidShareButton').hidden = typeof navigator.share !== 'function';
$('#androidShareButton').addEventListener('click', () => {
  if (items.length) shareWithAndroid(buildWhatsappReport());
});

$('#copyShareButton').addEventListener('click', async () => {
  if (!items.length) return;
  const text = buildWhatsappReport();
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw Error('clipboard indisponível');
    await navigator.clipboard.writeText(text);
    setShareFeedback('Mensagem copiada! Abra o WhatsApp, escolha a conversa e cole a mensagem.');
  } catch (error) {
    openShareDialog(text, 'Não foi possível copiar automaticamente. Selecione e copie o texto.');
  }
});

$('#closeShareDialog').addEventListener('click', () => $('#shareDialog').close());
$('#selectShareText').addEventListener('click', () => {
  $('#shareText').focus();
  $('#shareText').select();
  setShareFeedback('Texto selecionado. Use “Copiar” no menu do Android.');
});

// 7. PWA: instala a estrutura do app e abre sem internet depois do primeiro acesso.
// O reconhecimento de voz da Web Speech API pode exigir conexão.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service Worker indisponível:', error);
    });
  });
}

load();
render();
registerServiceWorker();
