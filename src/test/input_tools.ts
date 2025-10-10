import * as vscode from "vscode";
export const sampletools: vscode.LanguageModelChatTool[] = [
  {
    name: "edit_notebook_file",
    description: `This is a tool for editing an existing Notebook file in the workspace. Generate the "explanation" property first.
The system is very smart and can understand how to apply your edits to the notebooks.
When updating the content of an existing cell, ensure newCode preserves whitespace and indentation exactly and does NOT include any code markers such as (...existing code...).`,
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "An absolute path to the notebook file to edit, or the URI of a untitled, not yet named, file, such as `untitled:Untitled-1.",
        },
        cellId: {
          type: "string",
          description: "Id of the cell that needs to be deleted or edited. Use the value `TOP`, `BOTTOM` when inserting a cell at the top or bottom of the notebook, else provide the id of the cell after which a new cell is to be inserted. Remember, if a cellId is provided and editType=insert, then a cell will be inserted after the cell with the provided cellId.",
        },
        newCode: {
          anyOf: [
            {
              type: "string",
              description: "The code for the new or existing cell to be edited. Code should not be wrapped within <VSCode.Cell> tags. Do NOT include code markers such as (...existing code...) to indicate existing code.",
            },
            {
              type: "array",
              items: {
                type: "string",
                description: "The code for the new or existing cell to be edited. Code should not be wrapped within <VSCode.Cell> tags",
              },
            },
          ],
        },
        language: {
          type: "string",
          description: "The language of the cell. `markdown`, `python`, `javascript`, `julia`, etc.",
        },
        editType: {
          type: "string",
          enum: [
            "insert",
            "delete",
            "edit",
          ],
          description: `The operation peformed on the cell, whether \`insert\`, \`delete\` or \`edit\`.
Use the \`editType\` field to specify the operation: \`insert\` to add a new cell, \`edit\` to modify an existing cell's content, and \`delete\` to remove a cell.`,
        },
      },
      required: [
        "filePath",
        "editType",
        "cellId",
      ],
    },
  },
  {
    name: "fetch_webpage",
    description: "Fetches the main content from a web page. This tool is useful for summarizing or analyzing the content of a webpage. You should use this tool when you think the user is looking for information from a specific webpage.",
    inputSchema: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: {
            type: "string",
          },
          description: "An array of URLs to fetch content from.",
        },
        query: {
          type: "string",
          description: "The query to search for in the web page's content. This should be a clear and concise description of the content you want to find.",
        },
      },
      required: [
        "urls",
        "query",
      ],
    },
  },
  {
    name: "file_search",
    description: `Search for files in the workspace by glob pattern. This only returns the paths of matching files. Use this tool when you know the exact filename pattern of the files you're searching for. Glob patterns match from the root of the workspace folder. Examples:
- **/*.{js,ts} to match all js/ts files in the workspace.
- src/** to match all files under the top-level src folder.
- **/foo/**/*.js to match all js files under any foo folder in the workspace.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search for files with names or paths matching this glob pattern.",
        },
        maxResults: {
          type: "number",
          description: "The maximum number of results to return. Do not use this unless necessary, it can slow things down. By default, only some matches are returned. If you use this and don't see what you're looking for, you can try again with a more specific query or a larger maxResults.",
        },
      },
      required: [
        "query",
      ],
    },
  },
  {
    name: "terminal_last_command",
    description: "Get the last command run in the active terminal.",
  },
]

export const oaitools = [
  {
    "type": "function",
    "function": {
      "name": "edit_notebook_file",
      "description": "This is a tool for editing an existing Notebook file in the workspace. Generate the \"explanation\" property first.\nThe system is very smart and can understand how to apply your edits to the notebooks.\nWhen updating the content of an existing cell, ensure newCode preserves whitespace and indentation exactly and does NOT include any code markers such as (...existing code...).",
      "parameters": {
        "type": "object",
        "properties": {
          "filePath": {
            "type": "string",
            "description": "An absolute path to the notebook file to edit, or the URI of a untitled, not yet named, file, such as `untitled:Untitled-1."
          },
          "cellId": {
            "type": "string",
            "description": "Id of the cell that needs to be deleted or edited. Use the value `TOP`, `BOTTOM` when inserting a cell at the top or bottom of the notebook, else provide the id of the cell after which a new cell is to be inserted. Remember, if a cellId is provided and editType=insert, then a cell will be inserted after the cell with the provided cellId."
          },
          "newCode": {
            "anyOf": [
              {
                "type": "string",
                "description": "The code for the new or existing cell to be edited. Code should not be wrapped within <VSCode.Cell> tags. Do NOT include code markers such as (...existing code...) to indicate existing code."
              },
              {
                "type": "array",
                "items": {
                  "type": "string",
                  "description": "The code for the new or existing cell to be edited. Code should not be wrapped within <VSCode.Cell> tags"
                }
              }
            ]
          },
          "language": {
            "type": "string",
            "description": "The language of the cell. `markdown`, `python`, `javascript`, `julia`, etc."
          },
          "editType": {
            "type": "string",
            "enum": [
              "insert",
              "delete",
              "edit"
            ],
            "description": "The operation peformed on the cell, whether `insert`, `delete` or `edit`.\nUse the `editType` field to specify the operation: `insert` to add a new cell, `edit` to modify an existing cell's content, and `delete` to remove a cell."
          }
        },
        "required": [
          "filePath",
          "editType",
          "cellId"
        ]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "fetch_webpage",
      "description": "Fetches the main content from a web page. This tool is useful for summarizing or analyzing the content of a webpage. You should use this tool when you think the user is looking for information from a specific webpage.",
      "parameters": {
        "type": "object",
        "properties": {
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "An array of URLs to fetch content from."
          },
          "query": {
            "type": "string",
            "description": "The query to search for in the web page's content. This should be a clear and concise description of the content you want to find."
          }
        },
        "required": [
          "urls",
          "query"
        ]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "file_search",
      "description": "Search for files in the workspace by glob pattern. This only returns the paths of matching files. Use this tool when you know the exact filename pattern of the files you're searching for. Glob patterns match from the root of the workspace folder. Examples:\n- **/*.{js,ts} to match all js/ts files in the workspace.\n- src/** to match all files under the top-level src folder.\n- **/foo/**/*.js to match all js files under any foo folder in the workspace.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Search for files with names or paths matching this glob pattern."
          },
          "maxResults": {
            "type": "number",
            "description": "The maximum number of results to return. Do not use this unless necessary, it can slow things down. By default, only some matches are returned. If you use this and don't see what you're looking for, you can try again with a more specific query or a larger maxResults."
          }
        },
        "required": [
          "query"
        ]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "terminal_last_command",
      "description": "Get the last command run in the active terminal.",
      "parameters": {
        "type": "object",
        "properties": {}
      }
    }
  },
]
