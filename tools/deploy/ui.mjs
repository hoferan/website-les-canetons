// tools/deploy/ui.mjs
// Terminal UI for the deploy tool: a live step plan with progress bars on a
// TTY, plain sequential lines otherwise (CI logs, tee, pipes). This is the
// ONLY module that writes to the terminal; it consumes step/progress events
// and holds no business logic. `now` is injected so timing is testable.
export function humanBytes(n) {
  if (n >= 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

export function fmtDuration(ms) {
  if (ms >= 60000) {
    const m = Math.floor(ms / 60000);
    return `${m}m ${Math.round((ms - m * 60000) / 1000)}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

// [=========>----------] — `width` cells, arrow head while partial.
export function bar(done, total, width = 20) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const filled = Math.round(ratio * width);
  if (filled <= 0) {
    return `[${'-'.repeat(width)}]`;
  }
  if (filled >= width) {
    return `[${'='.repeat(width)}]`;
  }
  return `[${'='.repeat(filled - 1)}>${'-'.repeat(width - filled)}]`;
}

const GLYPH = { pending: '□', active: '▶', done: '✓', skip: '·', fail: '✗' };
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];

export function createUI({
  stream = process.stdout,
  isTTY = stream.isTTY === true,
  verbose = false,
  now = () => Date.now(),
  heartbeatMs = 10000,
} = {}) {
  const steps = [];
  const byId = new Map();
  let drawn = 0; // lines the TTY block currently occupies
  let activeId = null;
  let ticker = null;
  let tick = 0;
  const beats = new Map(); // stepId -> time of its last non-TTY heartbeat

  const write = (s) => stream.write(s);

  function stepLine(s) {
    let mid = s.note || '';
    if (s.status === 'active') {
      if (s.progress && s.progress.total > 0) {
        const { done, total, extra } = s.progress;
        const pct = Math.floor((done / total) * 100);
        mid = `${bar(done, total)} ${String(pct).padStart(3)}% · ${done}/${total}${extra ? ` · ${extra}` : ''}`;
      } else {
        const note = s.progress?.note || s.note || '';
        mid = `${SPINNER[tick % SPINNER.length]} ${note}`.trim() + ` (${fmtDuration(now() - s.startedAt)})`;
      }
    } else if (s.status === 'done') {
      mid = `${s.note || ''}${s.note ? '  ' : ''}(${fmtDuration(s.endedAt - s.startedAt)})`;
    } else if (s.status === 'skip') {
      mid = `skipped${s.note ? ` (${s.note})` : ''}`;
    } else if (s.status === 'fail') {
      mid = s.note || 'failed';
    }
    return ` ${GLYPH[s.status]} ${s.title.padEnd(14)} ${mid}`.trimEnd();
  }

  function draw() {
    if (!isTTY || steps.length === 0) {
      return;
    }
    if (drawn > 0) {
      write(`\x1b[${drawn}A\x1b[0J`); // cursor up over the block, clear to end
    }
    const lines = steps.map(stepLine);
    write(`${lines.join('\n')}\n`);
    drawn = lines.length;
  }

  // Print a normal scrolling line: in TTY mode the step block is cleared
  // first and redrawn after, so the line lands ABOVE the live block.
  function lineOut(text) {
    if (isTTY && drawn > 0) {
      write(`\x1b[${drawn}A\x1b[0J`);
      drawn = 0;
      write(`${text}\n`);
      draw();
    } else {
      write(`${text}\n`);
    }
  }

  function startTicker() {
    if (!isTTY || ticker) {
      return;
    }
    ticker = setInterval(() => {
      tick++;
      draw();
    }, 100);
    if (ticker.unref) {
      ticker.unref();
    }
  }

  return {
    info(text) {
      lineOut(text);
    },
    // Per-file detail; silent unless --verbose (or dry-run, which the caller
    // maps to verbose).
    detail(text) {
      if (verbose) {
        lineOut(`    ${text}`);
      }
    },
    plan(defs) {
      for (const d of defs) {
        const s = { id: d.id, title: d.title, status: 'pending', note: '', progress: null, startedAt: 0, endedAt: 0 };
        steps.push(s);
        byId.set(d.id, s);
      }
      draw();
      startTicker();
    },
    start(id, note) {
      const s = byId.get(id);
      s.status = 'active';
      s.startedAt = now();
      if (note !== undefined) {
        s.note = note;
      }
      activeId = id;
      if (isTTY) {
        draw();
      } else {
        write(`> ${s.title}${s.note ? ` — ${s.note}` : ''}\n`);
      }
    },
    progress(id, p) {
      const s = byId.get(id);
      s.progress = p;
      if (isTTY) {
        draw();
        return;
      }
      const last = beats.get(id) ?? s.startedAt;
      if (now() - last >= heartbeatMs) {
        beats.set(id, now());
        write(`  ${s.title}: ${p.total > 0 ? `${p.done}/${p.total}` : p.note || 'working'}…\n`);
      }
    },
    done(id, note) {
      const s = byId.get(id);
      s.status = 'done';
      s.endedAt = now();
      if (note !== undefined) {
        s.note = note;
      }
      s.progress = null;
      if (id === activeId) {
        activeId = null;
      }
      if (isTTY) {
        draw();
      } else {
        write(`OK ${s.title}${s.note ? ` — ${s.note}` : ''} (${fmtDuration(s.endedAt - s.startedAt)})\n`);
      }
    },
    skip(id, note) {
      const s = byId.get(id);
      s.status = 'skip';
      if (note !== undefined) {
        s.note = note;
      }
      if (isTTY) {
        draw();
      } else {
        write(`-- ${s.title} — skipped${s.note ? ` (${s.note})` : ''}\n`);
      }
    },
    fail(id, message, hint) {
      const s = byId.get(id ?? activeId);
      if (s) {
        s.status = 'fail';
        s.endedAt = now();
        if (isTTY) {
          draw();
        }
      }
      lineOut(`\nFAILED${s ? ` at ${s.title}` : ''}: ${message}${hint ? `\n  -> ${hint}` : ''}`);
    },
    failActive(message, hint) {
      this.fail(activeId, message, hint);
    },
    summary(text) {
      lineOut(`\n${text}`);
    },
    close() {
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
    },
  };
}
