import type { CaseItem, Topic } from "../types";

const koreanNaturalCollator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base"
});

export function compareTopicsByName(left: Topic, right: Topic) {
  return koreanNaturalCollator.compare(left.name, right.name);
}

export function compareCasesByTitle(left: CaseItem, right: CaseItem) {
  return koreanNaturalCollator.compare(left.case_no || left.title, right.case_no || right.title);
}
