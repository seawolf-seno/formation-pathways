// Five FICTIONAL inquiring families, for admissions to try the whole flow:
// inquiry → draft → sign → what the family sees. Loaded as samples
// (is_sample), so they're never exported to Finalsite. Every name, email and
// address is invented. Two come from schools that have alumni stories in the
// demo (Paul Revere, Calvary Christian), so "From your school" shows.

export interface DemoFamily {
  parent_first_name: string;
  parent_last_name: string;
  parent_relationship: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: number;
  current_school: string;
  one_thing: string;
  interests: string[];
}

export const DEMO_FAMILIES: DemoFamily[] = [
  {
    parent_first_name: "Grace", parent_last_name: "Okafor", parent_relationship: "Mother",
    child_first_name: "Wren", child_last_name: "Okafor", child_grade: 9, current_school: "Paul Revere Middle School",
    one_thing: "Wren rewired our garage lights after watching one video, then wrote the neighbors a one-page safety guide. She keeps a notebook of things she wants to take apart next.",
    interests: ["STEM", "Cross Country"],
  },
  {
    parent_first_name: "David", parent_last_name: "Pereira", parent_relationship: "Father",
    child_first_name: "Jonah", child_last_name: "Pereira", child_grade: 9, current_school: "Calvary Christian School",
    one_thing: "Jonah has filmed every family dinner for a year. He's cutting it into a documentary for his grandmother's 80th birthday and won't let anyone see it yet.",
    interests: ["Visual/Performing Arts", "Baseball"],
  },
  {
    parent_first_name: "Marisol", parent_last_name: "Ramos", parent_relationship: "Mother",
    child_first_name: "Lucía", child_last_name: "Ramos", child_grade: 9, current_school: "Back Bay Montessori",
    one_thing: "Lucía runs a lemonade and tamale stand at our church's fall festival. Last year she paid her cousins on commission and kept the books in a spiral notebook.",
    interests: ["Business/Entrepreneurship", "Soccer"],
  },
  {
    parent_first_name: "Karen", parent_last_name: "Brandt", parent_relationship: "Grandparent",
    child_first_name: "Eli", child_last_name: "Brandt", child_grade: 9, current_school: "Harbor Homeschool Co-op",
    one_thing: "Eli asks a question at dinner every night that none of us can answer. Last night it was: if forgiveness is free, why does it feel so expensive?",
    interests: ["Humanities", "Track"],
  },
  {
    parent_first_name: "Michael", parent_last_name: "Walsh", parent_relationship: "Father",
    child_first_name: "Sienna", child_last_name: "Walsh", child_grade: 10, current_school: "Seaside Charter",
    one_thing: "Sienna surfs before school most mornings and keeps a log of the tide, the water temperature and the trash she carries off the beach. It's three notebooks long.",
    interests: ["Surf", "STEM"],
  },
];
