import { isShown, visibleQuestions } from '@credflare/sdk-react-native';
import type { Question, ShowIf } from '@credflare/sdk-react-native';
import { fixture } from '../test-support/flow-harness';

const cases: {
  conditions: { name: string; condition: ShowIf['conditions'][number]; form: Record<string, unknown> | unknown[]; expect: boolean }[];
  show_if: { name: string; show_if: ShowIf | null; form: Record<string, unknown> | unknown[]; expect: boolean }[];
} = fixture('show-if-cases');

test('the spec holds 62 server computed cases', () => {
  expect(cases.conditions.length + cases.show_if.length).toBe(62);
});

test.each(cases.conditions.map(item => [item.name, item] as const))('condition: %s', (_name, item) => {
  expect(isShown({ show_if: { match: 'all', conditions: [item.condition] } }, item.form as Record<string, unknown>)).toBe(item.expect);
});

test.each(cases.show_if.map(item => [item.name, item] as const))('show_if: %s', (_name, item) => {
  expect(isShown({ show_if: item.show_if }, item.form as Record<string, unknown>)).toBe(item.expect);
});

test('a question follows the answers of questions that are still shown', () => {
  const schema: Question[] = fixture('questionnaire-session').data.profile.form_schema;
  const shown = (answers: Record<string, unknown>) => visibleQuestions(schema, answers).map(question => question.key);
  expect(shown({ employment: 'Student' })).not.toContain('employer');
  expect(shown({ employment: 'Employed' })).toEqual(expect.arrayContaining(['employer', 'income']));
  expect(shown({ employment: 'Self employed' })).toContain('income');
  expect(shown({ sources: ['Salary', 'Other'] })).toContain('sources_other');
  expect(shown({})).not.toContain('sources_other');
});
