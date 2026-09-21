import { getStudentsWithStats } from "@/lib/queries";
import { StudentList } from "@/components/StudentList";

export default function Home() {
  const students = getStudentsWithStats();
  return <StudentList students={students} />;
}
