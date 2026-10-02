import { describe, it, expect } from 'vitest';
import { isInsideClassNameContext } from './completionContext';

describe('isInsideClassNameContext', () => {
  it('is true right after className="', () => {
    expect(isInsideClassNameContext(`<div className="`)).toBe(true);
  });

  it('is true mid-string, after some classes already typed', () => {
    expect(isInsideClassNameContext(`<div className="flex p-`)).toBe(true);
  });

  it('is true inside a kb= attribute', () => {
    expect(isInsideClassNameContext(`<div kb="fle`)).toBe(true);
  });

  it('is true inside a clsx()/cn()/kb() call argument', () => {
    expect(isInsideClassNameContext(`clsx('`)).toBe(true);
    expect(isInsideClassNameContext(`cn("flex", '`)).toBe(true);
  });

  it('is false when not inside any open string at all', () => {
    expect(isInsideClassNameContext(`<div className=`)).toBe(false);
    expect(isInsideClassNameContext(`const x = 1;`)).toBe(false);
  });

  it('is false inside an unrelated string (not className/kb/a composer call)', () => {
    expect(isInsideClassNameContext(`<a href="`)).toBe(false);
  });

  it('is false once the string has already been closed', () => {
    expect(isInsideClassNameContext(`<div className="flex" `)).toBe(false);
  });

  it('does not get confused by an escaped quote inside the string', () => {
    expect(isInsideClassNameContext(`<div className="bg-[url(\\'a.png\\')] `)).toBe(true);
  });
});
