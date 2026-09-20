import { QuizApp } from "@/components/quiz-app";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { setup } = await searchParams;
  return <QuizApp initialSetup={setup === "1"} />;
}
