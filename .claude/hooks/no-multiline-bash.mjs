#!/usr/bin/env node
// PreToolUse hook (Bash) — reject multi-line inline shell scripts.
//
// Why this exists: Claude Code passes a multi-line Bash command as a single
// `bash.exe -c "... && eval '<script>'"` invocation, with every inner quote
// escaped through the PowerShell -> bash -> eval chain. The result is a very
// long, heavily-escaped command line containing `eval`, which corporate EDR
// scores as obfuscated-script execution and flags (a false positive we hit on
// 2026-07-25). Nothing in Claude Code's settings schema disables that wrapper,
// so the fix is to keep the payload OUT of the command line: write the script
// to a file, then run `bash <file>` — a short, plainly readable command.
//
// Heredocs are exempt: their newlines carry *data* (a git commit message body),
// not script logic, and they don't produce the same escaped-blob shape.
//
// Contract: reads the PreToolUse JSON payload on stdin, prints a deny decision
// on stdout, exits 0 either way. A hook that crashes must not block real work,
// so every failure path falls through to "allow".

const MAX_LINES_IN_HEREDOC = 40; // a commit message, not a smuggled script
const MAX_LENGTH = 1000; // single-line commands this long are also blob-shaped

const read = () =>
    new Promise((resolve) => {
        let buf = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (c) => (buf += c));
        process.stdin.on('end', () => resolve(buf));
        process.stdin.on('error', () => resolve(''));
    });

const deny = (reason) => {
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: reason,
            },
        }) + '\n'
    );
};

const SCRIPT_FILE_ADVICE =
    'Write the script to a file in the scratchpad directory (e.g. scratchpad/step.sh) ' +
    'with the Write tool, then run it as a single short command: `bash <path>`. ' +
    'Alternatively, use the PowerShell tool, which has no such wrapper. ' +
    'Rationale: .claude/hooks/no-multiline-bash.mjs';

const main = async () => {
    const raw = await read();
    if (!raw.trim()) return;

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return; // unparseable input is not this hook's problem — allow
    }

    const command = payload?.tool_input?.command;
    if (typeof command !== 'string' || !command) return;

    const lineCount = command.split('\n').length;
    const hasHeredoc = /<<-?\s*['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/.test(command);

    if (lineCount > 1 && hasHeredoc && lineCount <= MAX_LINES_IN_HEREDOC) {
        return; // multi-line data (commit message etc.), not an inline script
    }

    if (lineCount > 1) {
        deny(
            `This Bash command spans ${lineCount} lines. Claude Code wraps multi-line ` +
                `commands in a heavily-escaped \`eval '...'\`, which this machine's EDR ` +
                `flags as obfuscated script execution. ${SCRIPT_FILE_ADVICE}`
        );
        return;
    }

    if (command.length > MAX_LENGTH) {
        deny(
            `This Bash command is ${command.length} characters long (limit ${MAX_LENGTH}). ` +
                `Command lines that big read as an obfuscated payload to this machine's EDR. ` +
                `${SCRIPT_FILE_ADVICE}`
        );
    }
};

main().catch(() => {}); // never block real work on a hook bug
