"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Roadmap = exports.Project = void 0;
class Project {
    graphql;
    organization;
    project;
    iterationField;
    streamField;
    iterationTitle;
    roadmapProject;
    itemsPromise;
    constructor(graphql, organization, project, iterationField, streamField, iterationTitle) {
        this.graphql = graphql;
        this.organization = organization;
        this.project = project;
        this.iterationField = iterationField;
        this.streamField = streamField;
        this.iterationTitle = iterationTitle;
    }
    async initialize() {
        const query = `
            query ($owner: String!, $number: Int!, $iterationField: String!, $streamField: String!) {
                organization(login: $owner){
                    project: projectV2(number: $number) {
                        id
                        title
                        iterationField: field(name: $iterationField) {
                            __typename
                            ... on ProjectV2IterationField {
                                name
                                id
                                configuration {
                                    completedIterations {
                                        id
                                        startDate
                                        title
                                        duration
                                    }
                                    iterations {
                                        id
                                        startDate
                                        title
                                        duration
                                    }
                                }
                            }
                        }
                        streamField: field(name: $streamField) {
                            __typename
                            ... on ProjectV2SingleSelectField {
                                name
                                id
                                options {
                                    id
                                    name
                                }
                            }
                        }
                    }
                }
            }
        `;
        const result = await this.graphql(query, {
            owner: this.organization,
            number: this.project,
            iterationField: this.iterationField,
            streamField: this.streamField
        });
        this.roadmapProject = result.organization.project;
    }
    getCurrentIterationName() {
        return this.iterationTitle ?? this.getIterations()[0].title;
    }
    getCurrentIterationId() {
        return this.getIterations().find((i) => i.title === this.getCurrentIterationName()).id;
    }
    getIterations() {
        return [...this.roadmapProject.iterationField.configuration.completedIterations, ...this.roadmapProject.iterationField.configuration.iterations];
    }
    getStreams() {
        return this.roadmapProject.streamField.options;
    }
    async getStreamItems(stream) {
        const items = await this.getItems();
        const iterationId = this.getCurrentIterationId();
        const streamId = this.roadmapProject.streamField.options.find((o) => o.name === stream).id;
        return items.filter((i) => {
            return i.stream?.optionId === streamId && i.iteration?.iterationId === iterationId;
        });
    }
    async getOpenStreamItems(stream) {
        const items = await this.getStreamItems(stream);
        return items.filter((i) => {
            return i.content?.state === 'OPEN';
        });
    }
    async pageItems(query, cursor) {
        const items = [];
        const results = await this.graphql(query, {
            owner: this.organization,
            number: this.project,
            iteration: this.iterationField,
            stream: this.streamField,
            cursor: cursor ?? null,
        });
        const { nodes, pageInfo } = results.organization.project.items;
        items.push(...nodes);
        if (nodes.length === 100 && cursor != pageInfo.endCursor) {
            const nextPage = await this.pageItems(query, pageInfo.endCursor);
            items.push(...nextPage);
        }
        return items;
    }
    /**
     * Gets all items from the project board with the iteration and stream fields
     *
     * @returns all items on the project board
     */
    async getItems() {
        const query = `
            query ($owner: String!, $number: Int!, $iteration: String!, $stream: String!, $cursor: String) {
                organization(login: $owner){
                    project: projectV2(number: $number) {
                        items(first: 100, after: $cursor) {
                            totalCount
                            pageInfo {
                                endCursor
                                hasNextPage
                            }
                            nodes {
                                id
                                iteration: fieldValueByName(name: $iteration) {
                                    __typename
                                    ... on ProjectV2ItemFieldIterationValue {
                                        iterationId
                                        title
                                    }
                                }
                                stream: fieldValueByName(name: $stream) {
                                    __typename
                                    ... on ProjectV2ItemFieldSingleSelectValue {
                                        optionId
                                        name
                                    }
                                }
                                content {
                                    ... on Issue {
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
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;
        const items = await this.pageItems(query);
        return items.filter((i) => {
            return !!i.content?.labels?.nodes?.every((l) => l.name !== 'feature' && l.name !== 'epic');
        });
    }
}
exports.Project = Project;
class Roadmap {
    graphql;
    project;
    constructor(graphql, project) {
        this.graphql = graphql;
        this.project = project;
    }
    async createTrackingIssues(owner, name) {
        const streams = this.project.getStreams().filter((s) => s.name !== 'Shield');
        const issues = await Promise.all(streams.map(async (stream) => {
            const items = await this.project.getStreamItems(stream.name);
            if (items.length > 0) {
                const trackingIssue = await this.createTrackingIssue(owner, name, stream.name, items);
                return trackingIssue;
            }
        }));
        return issues.filter((i) => i !== undefined);
    }
    async updateTrackingIssues(owner, name) {
        const trackingIssues = await this.findTrackingIssues(owner, name);
        const streams = this.project.getStreams().filter((s) => s.name !== 'Shield');
        await Promise.all(streams.map(async (stream) => {
            const trackingIssue = trackingIssues.find((i) => i.title === `${stream.name} - ${this.project?.getCurrentIterationName()}`);
            const items = await this.project.getOpenStreamItems(stream.name);
            if (trackingIssue && items.length > 0) {
                await this.updateTrackingIssue(owner, name, trackingIssue.number, items);
            }
        }));
    }
    async createTrackingIssue(owner, name, stream, items) {
        const taskListItems = items.map(item => `- [ ] ${item.content.url}`).join("\n");
        const body = "```[tasklist]\n### Committed Tasks\n" + taskListItems + "\n```";
        const trackingIssue = await this.createIssue(owner, name, `${stream} - ${this.project?.getCurrentIterationName()}`, body);
        return trackingIssue;
    }
    async updateTrackingIssue(owner, name, number, items) {
        const issue = await this.getIssue(owner, name, number);
        const taskListItems = items.map(item => `- [ ] ${item.content.url}`).join("\n");
        const body = issue.body + "\n" + "```[tasklist]\n### Remaining Tasks as of " + new Date().toLocaleDateString() + "\n" + taskListItems + "\n```";
        await this.updateIssue(issue, body);
    }
    async findTrackingIssues(owner, name) {
        const query = `
            query($owner: String!, $name: String!) {
                organization(login: $owner) {
                    repository(name: $name) {
                        issues(first: 100, states:OPEN, labels:"sprint-tracking") {
                            nodes {
                                id
                                number
                                title
                                body
                            }
                        }
                    }
                }
            }
        `;
        const result = await this.graphql(query, {
            owner,
            name,
        });
        return result.organization.repository.issues.nodes;
    }
    async createIssue(owner, name, title, body) {
        const repository = await this.getRepository(owner, name);
        const query = `
        mutation CreateIssue($input: CreateIssueInput!) {
            createIssue(input: $input) {
                issue {
                    id
                    number
                }
            }
        }
        `;
        const result = await this.graphql(query, {
            input: {
                repositoryId: repository.id,
                title,
                body,
                labelIds: ["LA_kwDOEK6vU88AAAABdiowYQ"], // sprint-tracking
            }
        });
        return result.createIssue.issue;
    }
    async updateIssue(issue, body) {
        const query = `
        mutation UpdateIssue($input: UpdateIssueInput!) {
          updateIssue(input: $input) {
            issue {
              id
              number
            }
          }
        }
      `;
        const result = await this.graphql(query, {
            input: {
                id: issue.id,
                body,
            }
        });
        return result.updateIssue.issue;
    }
    async getIssue(owner, name, number) {
        const query = `
        query ($owner: String!, $name: String!, $number: Int!) { 
            repository (owner: $owner, name: $name) { 
                issueOrPullRequest (number: $number) {
                    ... on Issue {
                        repository {
                            owner {
                                id
                                login
                            }
                            name
                        }
                        id
                        number
                        title
                        body
                    }
                }
            }
        }
            `;
        const result = await this.graphql(query, {
            owner,
            name,
            number,
        });
        return result.repository.issueOrPullRequest;
    }
    async getRepository(owner, name) {
        const query = `
        query ($owner: String!, $name: String!) { 
          repository (owner: $owner, name: $name) { 
            id
            owner {
              id
              login
            }
            name
          }
        }
            `;
        const result = await this.graphql(query, {
            owner,
            name,
        });
        return result.repository;
    }
}
exports.Roadmap = Roadmap;
//# sourceMappingURL=roadmap.js.map