import { StudyTask } from "@/components/packets/study-task";

export default async function StudyPage({ params }: PageProps<"/study/[id]">) {
  const { id } = await params;
  return <StudyTask studyId={id} />;
}
