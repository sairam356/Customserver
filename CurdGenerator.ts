import axios from 'axios';
import * as yaml from 'yaml';
import { promises as fsPromises } from 'fs';
import OpenAI from "openai";
import * as path from 'path';
import * as fs from 'fs';

export class CurdGenerator {
    availableTools: { [key: string]: Function };
    identifiedLanguage: string | null;

    constructor() {
        this.availableTools = {
            saveFileToLocalDirectory: this.saveFileToLocalDirectory.bind(this),
            getLanguageInfo: this.getLanguageInfo.bind(this),

        };
        this.identifiedLanguage = null;
    }

    public async fetchAndParseSwagger(urlOrPath: string, isUrl: boolean = true): Promise<any> {
        let data: string;
        if (isUrl) {
            const response = await axios.get(urlOrPath);
            data = response.data;
        } else {
            data = await fsPromises.readFile(urlOrPath, { encoding: 'utf-8' });
        }
        return yaml.parse(data);
    }

    public async generateCode(componentType: string, modelName: string, operation: string, description: string, definition: string, userInput: string): Promise<any> {
        console.log("######## this called ###########");
        const val = "`";
        const updateInput = `Use getLanguageInfo and Generate ${userInput} code for ${componentType} to handle '${modelName}' ${operation}. Description: ${description}. Model definition: ${definition}.

        Please fix any errors in the code above.
        You will output the content of each new or changed file.
        Represent files like so:
        FILENAME
        ${val}${val}${val}
        CODE
        ${val}${val}${val}
        Example representation of a file:
        src/hello_world.ts
        ${val}${val}${val}
        print("Hello World")
        ${val}${val}${val}
        Use tools Get Response as Output as saveFileToLocalDirectory({FILENAME},{CODE})
        Do not comment on what every file does. Please note that the code should be fully functional. No placeholders.
        `;
        const tools = this.buildTools();

        const messages = [{ role: "user", content: updateInput }];
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY!,
            dangerouslyAllowBrowser: true,
        });

        const options: any = {
            model: 'gpt-3.5-turbo',
            temperature: 0.2,
            messages,
            tools,
        };

        let result = await openai.chat.completions.create(options);
        await this.processToolCalls(result, openai, tools, messages);
        
        const resultObj = await openai.chat.completions.create(options);
        await this.processToolCalls(resultObj, openai, tools, messages);

        // After saving results, now identify and fix issues

        console.log(result);
        return "Done";
    }

    private buildTools() {
        return [
            {
                type: "function",
                function: {
                    name: "saveFileToLocalDirectory",
                    description: "Get Response as Output and Save in File",
                    parameters: {
                        type: "object",
                        properties: {
                            code: { type: "string" },
                            fileName: { type: "string" },
                        },
                        required: ["code", "fileName"],
                    },
                }
            },
            {
                type: "function",
                function: {
                    name: "getLanguageInfo",
                    description: "External call with response given language info",
                    parameters: {
                        type: "object",
                        properties: {},
                    },
                }
            }
        ];
    }

    private async processToolCalls(result: OpenAI.Chat.Completions.ChatCompletion, openai: OpenAI, tools: any, messages: any): Promise<void> {
        for (let i = 0; i < result.choices.length; i++) {
            const choice = result.choices[i];
            const message = choice.message;
            console.log(message);
            if (choice.finish_reason === "tool_calls" && message && message.tool_calls) {
                for (let j = 0; j < message.tool_calls.length; j++) {
                    const toolCall = message.tool_calls[j];
                    if (toolCall && toolCall.function && typeof toolCall.function.name === "string") {
                        const functionName = toolCall.function.name;
                        console.log(functionName);
                        const functionArgs = JSON.parse(toolCall.function.arguments);
                        console.log(functionArgs);
                        const functionToCall = this.availableTools[functionName];
                        const response = await functionToCall.apply(null, Object.values(functionArgs));
                        if (response) {
                            messages.push({ role: "function", name: functionName, content: JSON.stringify(response) });
                        }
                    }
                }
            }
        }
    }

    public async identifyAndFixIssues(directoryPath: string, query: string): Promise<void> {
        let dir: any =[];
        const files = await this.listFilesAndFolders(directoryPath,dir);
        console.log(files);
        for (const filePath of files) {
            const code = await fsPromises.readFile(filePath, { encoding: 'utf-8' });
            const val = "`";
            // Formulate the prompt to fix the issues in the code
            const prompt = `The following code has ${query} ,Output should Only One :
            ${'```'}
            ${code}
            ${'```'}
            
                Please fix any errors in the code above.
                You will output the content of each new or changed file.
                Represent file like so:
                ${val}${val}${val}
                CODE
                ${val}${val}${val}
                Use tools Get Response as Output as enchanceAndSaveFileInLocalDirectory({CODE})
                Do not comment on what every file does. Please note that the code should be fully functional. No placeholders.
            `;
            const tools =[ {
                type: "function",
                function: {
                    name: "enchanceAndSaveFileInLocalDirectory",
                    description: "enchance repsonse has to store in file ",
                    parameters: {
                        type: "object",
                        properties: {
                            code: { type: "string" },
                        },
                        required: ["code"],
                    },
                }
            },]
            const messages = [{ role: "user", content: prompt }];
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY!,
                dangerouslyAllowBrowser: true,
            });
    
            const options: any = {
                model: 'gpt-3.5-turbo',
                temperature: 0.2,
                messages,
                tools
              
            };
    
            let enhancement = await openai.chat.completions.create(options);

            // Assuming the enhancement is in the form of code corrections
            if (enhancement.choices && enhancement.choices.length > 0) {
                const fixedCode = enhancement.choices[0].message;
                console.log(fixedCode);

                for (let i = 0; i < enhancement.choices.length; i++) {
                    const choice = enhancement.choices[i];
                    const message = choice.message;
                    console.log(message);
                    if (choice.finish_reason === "tool_calls" && message && message.tool_calls) {
                            const toolCall = message.tool_calls[0];
                            if (toolCall && toolCall.function && typeof toolCall.function.name === "string") {
                                const functionName = toolCall.function.name;
                                console.log(functionName);
                                if(functionName === "enchanceAndSaveFileInLocalDirectory"){
                                    const functionArgs = JSON.parse(toolCall.function.arguments);
                                    console.log(functionArgs);
                                    this.enchanceAndSaveFileInLocalDirectory(filePath,functionArgs["code"])
                                }
                            }
                    }
                }

            }
        }
    }

    public async enchanceAndSaveFileInLocalDirectory(filePath: any ,fixedCode: any){
        await fsPromises.unlink(filePath);
        await fsPromises.writeFile(filePath, fixedCode, { encoding: 'utf-8' });
    }

    public async saveFileToLocalDirectory(code: string, filename: string): Promise<void> {
        const baseDir = path.join(__dirname, './Output/');
        console.log(`Saving generated code to ${filename}`);

        const filePath = path.join(baseDir, filename);
        const dirName = path.dirname(filePath);

        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }

        await fsPromises.writeFile(filePath, code, { encoding: 'utf-8' });

        console.log(`Saved generated code to ${filePath}`);
    }

    public async getLanguageInfo(): Promise<{ lang: string }> {
        const response = await fetch("http://localhost:9090/prompt");
        const languageInfo = await response.json();
        return { lang: languageInfo.lang };
    }

    public async processSwagger(swagger: any, userInput: string): Promise<void> {
        for (const path in swagger.paths) {
            const pathDetails = swagger.paths[path];
            const modelName = path.split('/').pop()?.toUpperCase();
            for (const method in pathDetails) {
                const details = pathDetails[method];
                const operation = method.toUpperCase();
                const description = details.summary || 'No detailed description available.';
                const componentType = `${modelName}${operation}`;
                await this.generateCode(componentType, modelName!, operation, description, swagger.definitions, userInput);
            }
        }
    }

    public async listFilesAndFolders(directory: any, dir:any): Promise<any>  {
        
        let entries = [];
        try {
            // Read all directory entries (files and subdirectories) with file types
            entries = await fsPromises.readdir(directory, { withFileTypes: true });
          } catch (err) {
            console.error(`Error reading directory: ${directory}`, err);
            return; // Exit if a directory cannot be read
          }
        
          // Process each entry in the directory
          for (let entry of entries) {
            const fullPath = path.join(directory, entry.name);
        
            if (entry.isDirectory()) {
              console.log(`Directory: ${fullPath}`);
              // Recursively list files in the subdirectory
              await this.listFilesAndFolders(fullPath,dir);
            } else if (entry.isFile()) {
              console.log(`File: ${fullPath}`);
              dir.push(fullPath);
            }
          }
        return Promise.resolve(dir);
      }

       
      
}


