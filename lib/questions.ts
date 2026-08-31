import rawQuestions from "@/data/questions.json";
import type { Difficulty, Question } from "@/lib/types";

const difficulties: Difficulty[] = ["easy", "medium", "hard"];

function validateQuestions(input: unknown): Question[] {
  if (!Array.isArray(input)) throw new Error("Question bank must be an array.");
  const ids = new Set<string>();
  const questions = input.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Question ${index + 1} is not an object.`);
    const value = item as Record<string, unknown>;
    if (typeof value.id !== "string" || !value.id.trim()) throw new Error(`Question ${index + 1} has no valid ID.`);
    if (ids.has(value.id)) throw new Error(`Duplicate question ID: ${value.id}`);
    ids.add(value.id);
    if (!difficulties.includes(value.difficulty as Difficulty)) throw new Error(`Invalid difficulty on ${value.id}.`);
    for (const [language, text] of [["Chinese", value.zh], ["English", value.en]] as const) {
      const translated = text as Record<string, unknown> | undefined;
      if (!translated || typeof translated.question !== "string" || !translated.question.trim()) throw new Error(`${value.id} is missing its ${language} question.`);
      if (!Array.isArray(translated.answers) || translated.answers.length !== 3 || translated.answers.some((answer) => typeof answer !== "string" || !answer.trim())) throw new Error(`${value.id} must have exactly three ${language} answers.`);
    }
    if (![0, 1, 2].includes(value.correctAnswer as number)) throw new Error(`${value.id} has an invalid correct answer.`);
    return value as unknown as Question;
  });
  for (const difficulty of difficulties) {
    if (questions.filter((question) => question.difficulty === difficulty).length < 5) throw new Error(`At least five ${difficulty} questions are required.`);
  }
  return questions;
}

export const questions = validateQuestions(rawQuestions);
export const getQuestion = (id?: string) => questions.find((question) => question.id === id);

export function selectQuestions(difficulty: Difficulty, count = 5): Question[] {
  const shuffled = questions.filter((question) => question.difficulty === difficulty);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}
