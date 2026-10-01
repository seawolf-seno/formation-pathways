import { getStudentsWithStats } from "@/lib/queries";
import { StudentList } from "@/components/StudentList";
import { syncDemoDb } from "@/lib/demo-persist";

export default async function Home() {
  await syncDemoDb();
  const students = getStudentsWithStats();
  return <StudentList students={students} />;
}
