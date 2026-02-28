import { transform } from 'esbuild';
import type { ValidationResult } from './types';

const importExpression = /import[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const defaultExportExpression = /export\s+default\s+function\s+WindowApp\b/;

function extractImports(source: string): string[] {
  const imports: string[] = [];
  let match: RegExpExecArray | null = importExpression.exec(source);
  while (match) {
    imports.push(match[1]);
    match = importExpression.exec(source);
  }
  return imports;
}

export async function validateGeneratedSource(
  source: string,
  allowList: string[] = ['react']
): Promise<ValidationResult> {
  const issues: string[] = [];

  for (const moduleName of extractImports(source)) {
    if (!allowList.includes(moduleName)) {
      issues.push(`Disallowed import: ${moduleName}`);
    }
  }

  if (!defaultExportExpression.test(source)) {
    issues.push('Expected `export default function WindowApp`.');
  }

  try {
    await transform(source, {
      loader: 'tsx',
      format: 'esm',
      jsx: 'automatic',
      target: 'es2022'
    });
  } catch (error) {
    issues.push(`Compile validation failed: ${(error as Error).message}`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
