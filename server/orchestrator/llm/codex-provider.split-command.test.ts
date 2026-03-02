import { describe, expect, it } from 'vitest';
import { splitCommand } from './codex-provider';

describe('splitCommand', () => {
  it('splits basic commands on whitespace', () => {
    expect(splitCommand('codex exec --skip-git-repo-check')).toEqual([
      'codex',
      'exec',
      '--skip-git-repo-check'
    ]);
  });

  it('preserves backslashes in unquoted args', () => {
    expect(splitCommand(String.raw`codex exec --cwd C:\repo`)).toEqual([
      'codex',
      'exec',
      '--cwd',
      'C:\\repo'
    ]);
  });

  it('preserves backslashes inside double quotes unless escaping quote/backslash', () => {
    expect(splitCommand(String.raw`codex exec -c "foo\bar"`)).toEqual(['codex', 'exec', '-c', 'foo\\bar']);
    expect(splitCommand(String.raw`codex exec -c "foo\"bar"`)).toEqual(['codex', 'exec', '-c', 'foo"bar']);
    expect(splitCommand(String.raw`codex exec -c "foo\\bar"`)).toEqual(['codex', 'exec', '-c', 'foo\\bar']);
  });

  it('does not treat backslash as escape inside single quotes', () => {
    expect(splitCommand(String.raw`codex exec -c 'foo\bar'`)).toEqual(['codex', 'exec', '-c', 'foo\\bar']);
    expect(splitCommand(String.raw`codex exec -c 'foo\\bar'`)).toEqual([
      'codex',
      'exec',
      '-c',
      String.raw`foo\\bar`
    ]);
  });

  it('supports empty quoted args', () => {
    expect(splitCommand('codex exec --empty "" --x')).toEqual(['codex', 'exec', '--empty', '', '--x']);
  });

  it('supports escaping whitespace and quotes outside quotes', () => {
    expect(splitCommand(String.raw`codex exec --arg foo\ bar`)).toEqual(['codex', 'exec', '--arg', 'foo bar']);
    expect(splitCommand(String.raw`codex exec --arg \"hi\"`)).toEqual(['codex', 'exec', '--arg', '"hi"']);
  });
});

