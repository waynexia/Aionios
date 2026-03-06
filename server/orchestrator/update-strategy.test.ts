import { describe, expect, it } from 'vitest';
import { pickUpdateStrategy } from './update-strategy';

describe('pickUpdateStrategy', () => {
  it('uses remount for first render', () => {
    expect(
      pickUpdateStrategy(
        undefined,
        "import React from 'react'; export default function WindowApp() { return <div />; }"
      )
    ).toBe('remount');
  });

  it('uses hmr when imports stay stable and default export remains compatible', () => {
    const previousSource =
      "import React from 'react'; export default function WindowApp() { return <div>One</div>; }";
    const nextSource =
      "import React from 'react'; export default function WindowApp() { return <div>Two</div>; }";
    expect(pickUpdateStrategy(previousSource, nextSource)).toBe('hmr');
  });

  it('uses remount when imports change', () => {
    const previousSource =
      "import React from 'react'; export default function WindowApp() { return <div>One</div>; }";
    const nextSource =
      "import React from 'react'; import { useState } from 'react'; export default function WindowApp() { return <div>Two</div>; }";
    expect(pickUpdateStrategy(previousSource, nextSource)).toBe('remount');
  });

  it('uses remount when default export contract changes', () => {
    const previousSource =
      "import React from 'react'; export default function WindowApp() { return <div>One</div>; }";
    const nextSource =
      "import React from 'react'; export default () => <div>Two</div>;";
    expect(pickUpdateStrategy(previousSource, nextSource)).toBe('remount');
  });
});
