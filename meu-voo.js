/* Isca "meu voo". Dois modos (window.MV.estatico):
   - servidor: consulta /api/voo, baixa /api/ics, cadastra em /api/alertas
   - estático (GitHub Pages, prévia): lê a malha em dados/malha/<data>.json, gera o .ics no navegador e
     o cadastro de alerta só mostra como vai funcionar (não grava nada). */
(function () {
  var MV = window.MV || {};
  var R = MV.raiz || '';
  var $ = function (id) { return document.getElementById(id); };
  var atual = null;
  $('data').value = new Date().toISOString().slice(0, 10);

  function mostra(el, txt) { el.textContent = txt; el.classList.remove('oculto'); }
  function semAcento(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

  // --- código do voo -> {cia, numero} (modo estático) ---------------------------------
  function separa(txt, cias) {
    var c = (txt || '').trim();
    if (!c) throw 'Informe o voo, ex.: AD2837';
    var comp = c.replace(/[\s-]+/g, '').toUpperCase();
    var m = comp.match(/^([A-Z]{3})(\d{1,5})$/);
    if (m && cias.icao[m[1]]) return {cia: cias.icao[m[1]], numero: String(+m[2])};
    m = comp.match(/^([A-Z0-9]{2})(\d{1,5})$/);
    if (m && cias.iata[m[1]]) return {cia: m[1], numero: String(+m[2])};
    m = c.match(/^(.*?)[\s-]*(\d{1,5})$/);
    if (!m || !m[1]) throw 'Não entendi o voo (ex.: AD2837, G31238, LA3422)';
    var n = semAcento(m[1]);
    var nomes = Object.keys(cias.nomes).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < nomes.length; i++) {
      if (n === nomes[i] || n.indexOf(nomes[i]) === 0) return {cia: cias.nomes[nomes[i]], numero: String(+m[2])};
    }
    throw 'Companhia não reconhecida: ' + m[1];
  }

  function json(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw r.status; return r.json(); });
  }

  function consultaEstatica(codigo, data) {
    return json(R + '/dados/cias.json').then(function (cias) {
      var v = separa(codigo, cias);
      var cod = v.cia + v.numero;
      return json(R + '/dados/malha/' + data + '.json').then(function (malha) { return [cod, malha[cod]]; },
                                                           function () { return [cod, null]; })
        .then(function (x) {
          var f = x[1];
          return {codigo: x[0], cia: v.cia, numero: v.numero, data: data, achado: !!f,
                  origem: f ? f.o : null, destino: f ? f.d : null, partida: f ? f.p : null, chegada: f ? f.c : null,
                  partida_utc: f ? f.pu : null, chegada_utc: f ? f.cu : null, monitorado: f ? !!f.m : false,
                  escalas: f ? (f.e || []) : []};
        });
    });
  }

  // --- calendário no navegador (mesmo conteúdo do motor/alertas/ics.py) ---------------
  function icsEsc(s) { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function icsDt(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function dobra(l) {
    var out = [], atual = '', bytes = 0, lim = 75;
    for (var i = 0; i < l.length; i++) {
      var ch = l[i], b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > lim) { out.push(atual); atual = ''; bytes = 0; lim = 74; }
      atual += ch; bytes += b;
    }
    out.push(atual);
    return out.join('\r\n ');
  }
  function gerarIcs(cod, origem, destino, dep, arr) {
    var base = MV.base;
    arr = arr || new Date(dep.getTime() + 2 * 3600e3);
    var trecho = (origem || '?') + ' → ' + (destino || '?');
    var uid = cod + '-' + icsDt(dep) + '@motor-voos', agora = icsDt(new Date());
    var mala = new Date(arr.getTime() + 40 * 60e3), malaFim = new Date(arr.getTime() + 55 * 60e3);
    var descVoo = 'Voo ' + cod + ' ' + trecho + '.\nSe atrasar ou cancelar, seus direitos (Res. ANAC 400): ' + MV.resumo +
      '\nGuarde cartão de embarque, prints com a hora e notas de gastos.\nDireitos: ' + base + '/direitos/\nReceber alerta do voo: ' + base + '/meu-voo/';
    var descMala = 'Sua mala chegou? Se não, registre no balcão da companhia ANTES de sair da sala de desembarque e peça o comprovante. ' +
      'Teve atraso, cancelamento ou mala danificada?\nO que fazer: ' + base + '/direitos/bagagem-extraviada/\nFalar com um advogado: ' + MV.contato;
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//motor-voos//meu-voo//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + agora, 'DTSTART:' + icsDt(dep), 'DTEND:' + icsDt(arr),
      'SUMMARY:' + icsEsc('Voo ' + cod + ' ' + trecho), 'DESCRIPTION:' + icsEsc(descVoo), 'URL:' + base + '/meu-voo/',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT3H',
      'DESCRIPTION:' + icsEsc('Voo ' + cod + ' em 3 h: confira se mudou. Atrasou? Veja seus direitos.'), 'END:VALARM', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:mala-' + uid, 'DTSTAMP:' + agora, 'DTSTART:' + icsDt(mala), 'DTEND:' + icsDt(malaFim),
      'SUMMARY:' + icsEsc('Voo ' + cod + ': sua mala chegou? Teve atraso?'), 'DESCRIPTION:' + icsEsc(descMala),
      'URL:' + MV.contato, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M',
      'DESCRIPTION:' + icsEsc('Sua mala chegou? Teve atraso ou cancelamento? Veja o que fazer.'), 'END:VALARM', 'END:VEVENT',
      'END:VCALENDAR'];
    return L.map(dobra).join('\r\n') + '\r\n';
  }
  // hora local digitada (HH:MM) no fuso de Brasília -> Date UTC (prévia: Brasil sem horário de verão)
  function localBR(data, hhmm) { return new Date(data + 'T' + hhmm + ':00-03:00'); }

  function baixarIcsEstatico() {
    var dep, arr, o, d;
    if (atual.achado) {
      dep = new Date(atual.partida_utc); arr = atual.chegada_utc ? new Date(atual.chegada_utc) : null;
      o = atual.origem; d = atual.destino;
    } else {
      if (!$('partida').value) { alert('Informe a hora de partida.'); return; }
      dep = localBR(atual.data, $('partida').value);
      arr = $('chegada').value ? localBR(atual.data, $('chegada').value) : null;
      if (arr && arr <= dep) arr = new Date(arr.getTime() + 864e5);
      o = $('origem').value.toUpperCase(); d = $('destino').value.toUpperCase();
    }
    var blob = new Blob([gerarIcs(atual.codigo, o, d, dep, arr)], {type: 'text/calendar;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'voo-' + atual.codigo + '-' + atual.data + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function icsHref() {
    var p = new URLSearchParams({codigo: atual.codigo, data: atual.data});
    if (!atual.achado) {
      ['origem', 'destino', 'partida', 'chegada'].forEach(function (k) { if ($(k).value) p.set(k, $(k).value.toUpperCase()); });
    }
    return R + '/api/ics?' + p.toString();
  }

  function exibe(v) {
    atual = v;
    $('r-titulo').textContent = 'Voo ' + v.codigo + ' em ' + v.data.split('-').reverse().join('/');
    $('r-rota').textContent = v.achado ? (v.origem + ' → ' + v.destino + ' · partida ' + v.partida + ' · chegada ' + (v.chegada || '?') +
      (v.escalas.length ? ' · escala em ' + v.escalas.join(', ') : '')) : '';
    $('manual').classList.toggle('oculto', v.achado);
    $('r-mon').textContent = v.monitorado
      ? 'Acompanhamos os painéis deste aeroporto em tempo real: se o voo tiver problema, avisamos.'
      : (v.achado ? 'Ainda não acompanhamos os painéis destes aeroportos. O calendário funciona; o aviso só sai se o problema aparecer nos aeroportos que acompanhamos.'
                  : 'A malha da ANAC deste dia ainda não saiu (sai poucos dias antes). Informe os horários do bilhete para o calendário.');
    $('resultado').classList.remove('oculto');
    if (!MV.estatico) $('btn-ics').href = icsHref();
  }

  $('f-voo').addEventListener('submit', function (ev) {
    ev.preventDefault(); $('msg-voo').classList.add('oculto');
    if (MV.estatico) {
      consultaEstatica($('codigo').value, $('data').value).then(exibe)
        .catch(function (e) { mostra($('msg-voo'), typeof e === 'string' ? e : 'Não foi possível consultar.'); });
      return;
    }
    var p = new URLSearchParams({codigo: $('codigo').value, data: $('data').value});
    fetch(R + '/api/voo?' + p).then(function (r) { return r.json().then(function (j) { return [r.ok, j]; }); })
      .then(function (x) { if (!x[0]) { mostra($('msg-voo'), x[1].detail || 'Não foi possível consultar.'); return; } exibe(x[1]); })
      .catch(function () { mostra($('msg-voo'), 'Erro de conexão. Tente de novo.'); });
  });

  $('btn-ics').addEventListener('click', function (ev) {
    if (MV.estatico) { ev.preventDefault(); if (atual) baixarIcsEstatico(); }
  });
  ['origem', 'destino', 'partida', 'chegada'].forEach(function (k) {
    $(k).addEventListener('change', function () { if (atual && !MV.estatico) $('btn-ics').href = icsHref(); });
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name=canal]'), function (r) {
    r.addEventListener('change', function () {
      var wa = r.value === 'whatsapp' && r.checked;
      if (r.checked) {
        $('l-contato').textContent = wa ? 'Seu WhatsApp (DDD + número)' : 'Seu e-mail';
        $('contato').type = wa ? 'tel' : 'email';
        $('contato').placeholder = wa ? '(51) 99999-0000' : 'voce@exemplo.com';
      }
    });
  });

  $('f-alerta').addEventListener('submit', function (ev) {
    ev.preventDefault(); if (!atual) return;
    var canal = document.querySelector('input[name=canal]:checked').value;
    if (MV.estatico) {
      mostra($('msg-alerta'), 'Prévia: nada foi gravado. Na versão no ar, você recebe agora um link de confirmação ' +
        (canal === 'whatsapp' ? 'no WhatsApp' : 'no e-mail') + ' e, depois de confirmar, um aviso se o voo ' + atual.codigo +
        ' for cancelado, alternado ou atrasar, já com os seus direitos.');
      return;
    }
    fetch(R + '/api/alertas', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({codigo: atual.codigo, data: atual.data, canal: canal, destino: $('contato').value,
                            consentimento: $('consent').checked})})
      .then(function (r) { return r.json().then(function (j) { return [r.ok, j]; }); })
      .then(function (x) { mostra($('msg-alerta'), x[0] ? x[1].mensagem : (x[1].detail || 'Não foi possível cadastrar.')); })
      .catch(function () { mostra($('msg-alerta'), 'Erro de conexão. Tente de novo.'); });
  });
})();
