import { getTaskbarStatus } from '../actions.mjs';

function getRevisionExpression(windowId) {
  return `(() => {
    const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
    if (!(frame instanceof HTMLElement)) return null;
    const text = frame.querySelector('.window-frame__title small')?.textContent ?? '';
    const match = text.match(/rev\\s+(\\d+)/i);
    if (!match) return null;
    return Number.parseInt(match[1], 10);
  })()`;
}

export default {
  id: 'llm-update',
  title: 'LLM window updates and loads new revision',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const appId = 'notes';
    const iconSelector = `.desktop-icon[data-app-id="${appId}"]`;
    const existingWindowIds = await ctx.evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(
        `.window-frame[data-app-id="${appId}"]`
      )})).map((frame) => frame.getAttribute('data-window-id')).filter(Boolean)`
    );

    const contextMenuDispatched = await ctx.evaluate(
      `(() => {
        const icon = document.querySelector(${JSON.stringify(iconSelector)});
        if (!(icon instanceof HTMLElement)) {
          return false;
        }
        icon.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = icon.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y
        });
        icon.dispatchEvent(event);
        return true;
      })()`
    );
    if (!contextMenuDispatched) {
      throw new Error(`Unable to dispatch context menu event for appId=${appId}`);
    }

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') instanceof HTMLElement")),
      'Icon context menu did not open'
    );

    const contextMenuSelected = await ctx.evaluate(
      `(() => {
        const item = document.querySelector('[data-context-menu-item="open-with-prompt"]');
        if (!(item instanceof HTMLButtonElement)) return false;
        item.click();
        return true;
      })()`
    );
    if (!contextMenuSelected) {
      throw new Error('Unable to select "Open with prompt…" from icon context menu');
    }

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-prompt-dialog]') instanceof HTMLElement")),
      'Prompt dialog did not open after selecting open-with-prompt'
    );

    const openPrompt = 'Build a note-taking window with a markdown preview and a tag picker.';
    const promptFilled = await ctx.evaluate(
      `(() => {
        const textarea = document.querySelector('.prompt-dialog__textarea');
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(textarea, ${JSON.stringify(openPrompt)});
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );
    if (!promptFilled) {
      throw new Error('Unable to fill prompt dialog textarea');
    }

    const promptSubmitted = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('.prompt-dialog__button--primary');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!promptSubmitted) {
      throw new Error('Unable to submit prompt dialog');
    }

    let windowId = null;
    const resolveOpenedWindowId = async () =>
      ctx.evaluate(
        `(() => {
          const existing = new Set(${JSON.stringify(existingWindowIds)});
          const frames = Array.from(document.querySelectorAll(${JSON.stringify(
            `.window-frame[data-app-id="${appId}"]`
          )}));
          for (const frame of frames) {
            if (!(frame instanceof HTMLElement)) continue;
            const id = frame.dataset.windowId;
            if (!id) continue;
            if (existing.has(id)) continue;
            return id;
          }
          const taskbarButtons = Array.from(document.querySelectorAll(${JSON.stringify(
            `.taskbar__window[data-app-id="${appId}"]`
          )}));
          for (const button of taskbarButtons) {
            if (!(button instanceof HTMLElement)) continue;
            const id = button.dataset.windowId;
            if (!id) continue;
            if (existing.has(id)) continue;
            return id;
          }
          return null;
        })()`
      );

    await ctx.waitFor(
      async () => {
        windowId = await resolveOpenedWindowId();
        return Boolean(windowId);
      },
      `Window frame did not appear for appId=${appId}`,
      8000
    );

    await ctx.waitFor(async () => {
      const status = await getTaskbarStatus(ctx, windowId);
      return status === 'ready' || status === 'error';
    }, 'LLM window did not resolve to ready/error');

    const finalStatus = await getTaskbarStatus(ctx, windowId);
    if (finalStatus === 'error') {
      const runtimeMessage = await ctx.evaluate(
        `document.querySelector(${JSON.stringify(
          `.window-frame[data-window-id="${windowId}"] .window-runtime__status`
        )})?.textContent?.trim() ?? ''`
      );
      throw new Error(
        `Window opened in error state for appId=${appId}: ${runtimeMessage || 'unknown error'}`
      );
    }

    const hasHostUpdateControl = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        return Boolean(frame.querySelector('.window-frame__actions button[aria-label="Ask LLM to update window"]'));
      })()`
    );
    if (!hasHostUpdateControl) {
      throw new Error('Expected host LLM update control to be present in window header');
    }

    const initialRevision = await ctx.evaluate(getRevisionExpression(windowId));
    if (typeof initialRevision !== 'number' || initialRevision < 1) {
      throw new Error(`Unable to resolve initial LLM revision: ${String(initialRevision)}`);
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const paragraphs = Array.from(frame.querySelectorAll('p'));
              for (const paragraph of paragraphs) {
                const text = paragraph.textContent?.trim() ?? '';
                if (text.includes('Last instruction:') && text.includes('tag picker')) {
                  return true;
                }
              }
              return false;
            })()`
          )
        ),
      'Expected initial open-with-prompt summary to reflect prompt'
    );

    const clicked = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const buttons = Array.from(frame.querySelectorAll('button'));
        const target = buttons.find((button) => (button.textContent ?? '').includes('Ask LLM to Evolve'));
        if (!(target instanceof HTMLButtonElement)) return false;
        target.click();
        return true;
      })()`
    );
    if (!clicked) {
      throw new Error('Unable to click "Ask LLM to Evolve" button inside LLM window');
    }

    await ctx.waitFor(
      async () => {
        const status = await getTaskbarStatus(ctx, windowId);
        if (status !== 'ready') {
          return false;
        }
        const revision = await ctx.evaluate(getRevisionExpression(windowId));
        return typeof revision === 'number' && revision > initialRevision;
      },
      'LLM window did not update to a newer revision'
    );

    const summary = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return '';
        const paragraphs = Array.from(frame.querySelectorAll('p'));
        for (const paragraph of paragraphs) {
          const text = paragraph.textContent?.trim() ?? '';
          if (text.includes('Last instruction:')) {
            return text;
          }
        }
        return '';
      })()`
    );
    if (!summary.includes('Last instruction:')) {
      throw new Error(`Expected updated mock summary to include last instruction, got: ${JSON.stringify(summary)}`);
    }

    const updatedRevision = await ctx.evaluate(getRevisionExpression(windowId));
    if (typeof updatedRevision !== 'number' || updatedRevision <= initialRevision) {
      throw new Error(`Unable to resolve updated revision: ${String(updatedRevision)}`);
    }

    const historyOpened = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const button = frame.querySelector('.window-frame__actions button[aria-label="Show revision history"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!historyOpened) {
      throw new Error('Unable to open revision history dialog');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate("document.querySelector('[data-revision-dialog]') instanceof HTMLElement")
        ),
      'Revision history dialog did not open'
    );

    await ctx.waitFor(
      async () => {
        const count = await ctx.evaluate(
          "document.querySelectorAll('[data-revision-item]').length"
        );
        return typeof count === 'number' && count >= 2;
      },
      'Revision history did not list at least two revisions'
    );

    const promptOpened = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-revision-prompt="${updatedRevision}"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        if (button.disabled) return false;
        button.click();
        return true;
      })()`
    );
    if (!promptOpened) {
      throw new Error(`Unable to open prompt viewer for revision ${String(updatedRevision)}`);
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate("document.querySelector('[data-revision-prompt-viewer]') instanceof HTMLElement")
        ),
      'Prompt viewer did not open'
    );

    const promptText = await ctx.evaluate(
      `document.querySelector('.revision-dialog__prompt-textarea')?.value ?? ''`
    );
    if (!promptText.includes('[redacted]')) {
      throw new Error(`Expected revision prompt to redact previous source, got: ${JSON.stringify(promptText.slice(0, 280))}`);
    }
    if (promptText.includes('Save to Host FS')) {
      throw new Error('Revision prompt unexpectedly includes source content ("Save to Host FS")');
    }

    const promptEditedInstruction = 'Prompt edit: add a search bar';
    const promptEditClicked = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-revision-prompt-edit]');
        if (!(button instanceof HTMLButtonElement)) return false;
        if (button.disabled) return false;
        button.click();
        return true;
      })()`
    );
    if (!promptEditClicked) {
      throw new Error('Unable to enter prompt edit mode');
    }

    const promptEdited = await ctx.evaluate(
      `(() => {
        const textarea = document.querySelector('.revision-dialog__prompt-textarea');
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        const current = textarea.value;
        const marker = 'User instruction for this update:';
        const contextMarker = '\\nRecent context:';
        const start = current.indexOf(marker);
        if (start === -1) return false;
        let contentStart = start + marker.length;
        if (current[contentStart] === '\\r' && current[contentStart + 1] === '\\n') {
          contentStart += 2;
        } else if (current[contentStart] === '\\n') {
          contentStart += 1;
        }
        const end = current.indexOf(contextMarker, contentStart);
        const next =
          end === -1
            ? current.slice(0, contentStart) + ${JSON.stringify(promptEditedInstruction)} + '\\n'
            : current.slice(0, contentStart) + ${JSON.stringify(promptEditedInstruction)} + current.slice(end);
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(textarea, next);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );
    if (!promptEdited) {
      throw new Error('Unable to edit prompt textarea');
    }

    const regenerateClicked = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-revision-prompt-regenerate]');
        if (!(button instanceof HTMLButtonElement)) return false;
        if (button.disabled) return false;
        button.click();
        return true;
      })()`
    );
    if (!regenerateClicked) {
      throw new Error('Unable to regenerate from edited prompt');
    }

    await ctx.waitFor(
      async () => {
        const status = await getTaskbarStatus(ctx, windowId);
        if (status !== 'ready') {
          return false;
        }
        const revision = await ctx.evaluate(getRevisionExpression(windowId));
        return typeof revision === 'number' && revision > updatedRevision;
      },
      'LLM window did not update after regenerating from edited prompt'
    );

    const regeneratedSummary = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return '';
        const paragraphs = Array.from(frame.querySelectorAll('p'));
        for (const paragraph of paragraphs) {
          const text = paragraph.textContent?.trim() ?? '';
          if (text.includes('Last instruction:')) {
            return text;
          }
        }
        return '';
      })()`
    );
    if (!regeneratedSummary.includes(promptEditedInstruction)) {
      throw new Error(
        'Expected regenerated mock summary to reflect edited prompt instruction, got: ' +
          JSON.stringify(regeneratedSummary)
      );
    }

    const promptClosed = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-revision-prompt-close]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!promptClosed) {
      throw new Error('Unable to close prompt viewer');
    }

    const revisionBeforeListRegenerate = await ctx.evaluate(getRevisionExpression(windowId));
    if (typeof revisionBeforeListRegenerate !== 'number' || revisionBeforeListRegenerate <= 0) {
      throw new Error(
        `Unable to resolve revision before list regenerate: ${String(revisionBeforeListRegenerate)}`
      );
    }

    const listRegenerateClicked = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-revision-regenerate="${revisionBeforeListRegenerate}"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        if (button.disabled) return false;
        button.click();
        return true;
      })()`
    );
    if (!listRegenerateClicked) {
      throw new Error(`Unable to click list regenerate for revision ${String(revisionBeforeListRegenerate)}`);
    }

    await ctx.waitFor(
      async () => {
        const status = await getTaskbarStatus(ctx, windowId);
        if (status !== 'ready') {
          return false;
        }
        const revision = await ctx.evaluate(getRevisionExpression(windowId));
        return typeof revision === 'number' && revision > revisionBeforeListRegenerate;
      },
      'LLM window did not update after list regenerate'
    );

    const windowIdsBeforeBranch = await ctx.evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(
        `.window-frame[data-app-id="${appId}"]`
      )})).map((frame) => frame.getAttribute('data-window-id')).filter(Boolean)`
    );

    const branchClicked = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-revision-branch="1"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        if (button.disabled) return false;
        button.click();
        return true;
      })()`
    );
    if (!branchClicked) {
      throw new Error('Unable to branch from revision 1');
    }

    let branchedWindowId = null;
    await ctx.waitFor(
      async () => {
        branchedWindowId = await ctx.evaluate(
          `(() => {
            const existing = new Set(${JSON.stringify(windowIdsBeforeBranch)});
            const frames = Array.from(document.querySelectorAll(${JSON.stringify(
              `.window-frame[data-app-id="${appId}"]`
            )}));
            for (const frame of frames) {
              if (!(frame instanceof HTMLElement)) continue;
              const id = frame.dataset.windowId;
              if (!id) continue;
              if (existing.has(id)) continue;
              return id;
            }
            return null;
          })()`
        );
        return typeof branchedWindowId === 'string' && branchedWindowId.length > 0;
      },
      'Branched window did not open'
    );
    if (typeof branchedWindowId !== 'string' || branchedWindowId.length === 0) {
      throw new Error(`Unable to resolve branched window id: ${String(branchedWindowId)}`);
    }

    await ctx.waitFor(
      async () => {
        const status = await getTaskbarStatus(ctx, branchedWindowId);
        if (status !== 'ready') {
          return false;
        }
        const revision = await ctx.evaluate(getRevisionExpression(branchedWindowId));
        return revision === 1;
      },
      'Branched window did not load revision 1'
    );

    const branchedSummary = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${branchedWindowId}"]');
        if (!(frame instanceof HTMLElement)) return '';
        const paragraphs = Array.from(frame.querySelectorAll('p'));
        for (const paragraph of paragraphs) {
          const text = paragraph.textContent?.trim() ?? '';
          if (text.includes('Last instruction:')) {
            return text;
          }
        }
        return '';
      })()`
    );
    if (!branchedSummary.includes('tag picker')) {
      throw new Error(`Expected branched summary to reflect revision 1 content, got: ${JSON.stringify(branchedSummary)}`);
    }

    const rollbackClicked = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-revision-rollback="1"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        if (button.disabled) return false;
        button.click();
        return true;
      })()`
    );
    if (!rollbackClicked) {
      throw new Error('Unable to click rollback button for revision 1');
    }

    await ctx.waitFor(
      async () => {
        const status = await getTaskbarStatus(ctx, windowId);
        if (status !== 'ready') {
          return false;
        }
        const revision = await ctx.evaluate(getRevisionExpression(windowId));
        return revision === 1;
      },
      'LLM window did not rollback to revision 1'
    );

    await ctx.waitFor(
      async () => {
        const summary = await ctx.evaluate(
          `(() => {
            const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
            if (!(frame instanceof HTMLElement)) return '';
            const paragraphs = Array.from(frame.querySelectorAll('p'));
            for (const paragraph of paragraphs) {
              const text = paragraph.textContent?.trim() ?? '';
              if (text.includes('Last instruction:')) {
                return text;
              }
            }
            return '';
          })()`
        );
        return typeof summary === 'string' && summary.includes('tag picker');
      },
      'Rolled-back window summary did not appear'
    );

    const rolledBackSummary = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return '';
        const paragraphs = Array.from(frame.querySelectorAll('p'));
        for (const paragraph of paragraphs) {
          const text = paragraph.textContent?.trim() ?? '';
          if (text.includes('Last instruction:')) {
            return text;
          }
        }
        return '';
      })()`
    );
    if (!rolledBackSummary.includes('Last instruction:') || !rolledBackSummary.includes('tag picker')) {
      throw new Error(`Expected rolled-back summary to return to the open prompt, got: ${JSON.stringify(rolledBackSummary)}`);
    }

    const revisionDialogClosed = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('button[aria-label="Close revision history"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!revisionDialogClosed) {
      throw new Error('Unable to close revision history dialog at end of llm-update case');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate("document.querySelector('[data-revision-dialog]') === null")
        ),
      'Revision history dialog did not close after llm-update'
    );
  }
};
