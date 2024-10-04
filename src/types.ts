import { Issue as GraphQLIssue } from "@octokit/graphql-schema";

export interface IssueType {
    id: string;
    name: string;
}

export type Issue = GraphQLIssue & {
    issueType: IssueType;
}