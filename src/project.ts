import { ClearProjectV2ItemFieldValueInput, CreateIssueInput, CreateIssuePayload, Issue, IssueConnection, ProjectV2, ProjectV2Field, ProjectV2FieldConfiguration, ProjectV2Item, ProjectV2ItemConnection, ProjectV2ItemFieldIterationValue, ProjectV2ItemFieldSingleSelectValue, ProjectV2IterationField, ProjectV2IterationFieldIteration, ProjectV2SingleSelectField, ProjectV2SingleSelectFieldOption, Repository, UpdateIssueInput, UpdateIssuePayload, UpdateProjectV2ItemFieldValueInput } from '@octokit/graphql-schema';
import { GraphQlResponse } from '@octokit/graphql/types';
import { RequestHeaders, RequestParameters } from '@octokit/types';


type graphql = <ResponseData>(query: string, parameters?: RequestParameters) => GraphQlResponse<ResponseData>;

export class Project {
    private project?: ProjectV2;

    constructor(private graphql: graphql, private owner: string, private projectId: number) { }

    /**
     * Initializes the project, loading the fields
     */
    public async initialize(): Promise<void> {
        const query = `
            query ($owner: String!, $number: Int!) {
                organization(login: $owner){
                    project: projectV2(number: $number) {
                        ... on ProjectV2 {
                            id
                            title
                            fields(first: 25) {
                                totalCount
                                pageInfo {
                                    endCursor
                                    hasNextPage
                                }
                                nodes {
                                    ... on ProjectV2Field {
                                        id
                                        name
                                    }
                                    ... on ProjectV2IterationField {
                                        id
                                        name
                                        configuration {
                                            iterations {
                                                startDate
                                                id
                                            }
                                        }
                                    }
                                    ... on ProjectV2SingleSelectField {
                                        id
                                        name
                                        options {
                                            id
                                            name
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const result = await this.graphql<{ organization: { project: ProjectV2 } }>(query, {
            owner: this.owner,
            number: this.projectId,
        });

        this.project = result.organization.project;
    }

    public getId(): string {
        return this.project!.id;
    }

    public getFieldByName<T extends ProjectV2FieldConfiguration>(name: string): T {
        const fields = this.getFields();
        return fields.find(f => f.name === name) as T;
    }

    /**
     * Gets the fields for the project
     * 
     * @returns the fields for the project
     */
    public getFields(): ProjectV2FieldConfiguration[] {
        return this.project!.fields.nodes as ProjectV2FieldConfiguration[];
    }

    /**
     * Gets all items from the project board
     *
     * @returns all items on the project board
     */
    public async getItems(): Promise<ProjectV2Item[]> {
        const query = `
            query ($owner: String!, $number: Int!, $cursor: String) {
                organization(login: $owner){
                    project: projectV2(number: $number) {
                        ... on ProjectV2 {
                            items(first: 100, after: $cursor) {
                                totalCount
                                pageInfo {
                                    endCursor
                                    hasNextPage
                                }
                                nodes {
                                    id
                                    fieldValues(first: 25) {
                                        totalCount
                                        pageInfo {
                                            endCursor
                                            hasNextPage
                                        }
                                        nodes {                
                                            ... on ProjectV2ItemFieldTextValue {
                                                __typename
                                                id
                                                text
                                                field {
                                                    ... on ProjectV2FieldCommon {
                                                        id
                                                        name
                                                    }
                                                }
                                            }
                                            ... on ProjectV2ItemFieldDateValue {
                                                __typename
                                                id
                                                date
                                                field {
                                                    ... on ProjectV2FieldCommon {
                                                        id
                                                        name
                                                    }
                                                }
                                            }
                                            ... on ProjectV2ItemFieldSingleSelectValue {
                                                __typename
                                                id
                                                name
                                                optionId
                                                field {
                                                    ... on ProjectV2FieldCommon {
                                                        id
                                                        name
                                                    }
                                                }
                                            }
                                        }              
                                    }
                                    content {
                                        ... on Issue {
                                            __typename
                                            id
                                            number
                                            title
                                            state
                                            url
                                            labels(first:100) {
                                                nodes {
                                                    id
                                                    name
                                                }
                                            }
                                            issueType {
                                                id
                                                name
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        return await this.pageItems(query);
    }

    public async clearProjectItemFieldValue(input: ClearProjectV2ItemFieldValueInput): Promise<void> {
        const query = `
        mutation ClearProjectItemFieldValue($input: ClearProjectV2ItemFieldValueInput!) {
            clearProjectV2ItemFieldValue(input: $input) {
                clientMutationId
                projectV2Item {
                    id
                }
            }
        }
        `;

        await this.graphql(
            query,
            {
                input
            }
        );
    }

    public async updateProjectItemFieldValue(input: UpdateProjectV2ItemFieldValueInput): Promise<void> {
        const query = `
        mutation UpdateProjectItemFieldValue($input: UpdateProjectV2ItemFieldValueInput!) {
            updateProjectV2ItemFieldValue(input: $input) {
                clientMutationId
                projectV2Item {
                    id
                }
            }
        }
        `;

        await this.graphql(
            query,
            {
                input
            }
        );
    }

    private async pageItems(query: string, cursor?: string): Promise<ProjectV2Item[]> {
        const items: ProjectV2Item[] = [];

        const results = await this.graphql<{ organization: { project: ProjectV2 } }>(query, {
            owner: this.owner,
            number: this.projectId,
            cursor: cursor ?? null,
        });

        const { nodes, pageInfo } = results.organization.project.items;

        items.push(...nodes as ProjectV2Item[]);

        if (nodes!.length === 100 && cursor != pageInfo.endCursor) {
            const nextPage = await this.pageItems(query, pageInfo.endCursor!);
            items.push(...nextPage);
        }

        return items;
    }
}