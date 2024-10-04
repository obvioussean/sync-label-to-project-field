import { ProjectV2ItemContent, ProjectV2ItemFieldSingleSelectValue, ProjectV2ItemFieldValue } from "@octokit/graphql-schema";
import { Issue } from "./types.js";

export function isIssue(item: ProjectV2ItemContent | null | undefined): item is Issue {
    return (item && item.__typename == "Issue") || false;
}

export function isSingleSelectField(item: ProjectV2ItemFieldValue | null | undefined): item is ProjectV2ItemFieldSingleSelectValue {
    return (item && item.__typename == "ProjectV2ItemFieldSingleSelectValue") || false;
}
