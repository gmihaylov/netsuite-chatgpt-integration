/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @author Georgi Mihaylov <mihaylov@gmail.com>
 * @see {@link https://github.com/gmihaylov/netsuite-chatgpt-chat}
 */
define(['N/https', 'N/error', 'N/log', 'N/runtime', 'N/file', 'N/query', 'N/search'],

    (https, error, log, runtime, file, query, search) => {

        const OPENAI_MODELS = {
            GPT3: 'gpt-3.5-turbo-1106',
            GPT4: 'gpt-4',
            GPT4TURBO: 'gpt-4-1106-preview'
        }

        // OpenAI Specific
        const OPENAI_API_KEY = '';
        const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
        const OPENAI_MODEL = OPENAI_MODELS.GPT3;
        const OPENAI_TEMPERATURE = 1; // What sampling temperature to use, between 0 and 2. Defaults to 1
        const SYSTEM_PROMPT = 'You are a NetSuite assistant, skilled in NetSuite concepts with creative flair.';

        // App Specific
        const APP_NAME = 'NetSuite Chat GPT SL';

        // Context related
        const CONTEXT_MAGIC_WORD = '!givemorecontext';
        const CONTEXT_EXPOSED_FIELDS = ['tranid'];
        const CONTEXT_PROMPT = "I'm currently logged into NetSuite and viewing Sales Order ${tranid}";

        /**
         * Defines the Suitelet script trigger point.
         * @param {Object} scriptContext
         * @param {ServerRequest} scriptContext.request - Incoming request
         * @param {ServerResponse} scriptContext.response - Suitelet response
         * @since 2015.2
         */
        const onRequest = (scriptContext) => {
            let query = scriptContext.request.parameters.query;
            const context = scriptContext.request.parameters.context === 'true';
            const isMagicWord = query === CONTEXT_MAGIC_WORD;

            if(context && isMagicWord) {
                const id = scriptContext.request.parameters.id;
                const type = scriptContext.request.parameters.type;

                const fieldValues = search.lookupFields({
                    type: type,
                    id: id,
                    columns: CONTEXT_EXPOSED_FIELDS
                });

                let contextMessage = CONTEXT_PROMPT;

                CONTEXT_EXPOSED_FIELDS.forEach(function (field) {
                    contextMessage = contextMessage.replace('${' + field + '}', fieldValues[field])
                });

                query = contextMessage;

                log.debug({
                    title: APP_NAME,
                    details: `Context mode: Enabled, ID: ${id} Type: ${type} Context Query: ${contextMessage}`
                });
            } else {
                log.debug({
                    title: APP_NAME,
                    details: `Context mode: Disabled`
                })
            }

            let responseJSON = {};
            let openAIResponse = {
                reply: 'Sorry, ChatGPT is currently unavailable. Please try again later.'
            };

            const message = {"role": "user", "content": query};

            try {
                const messages = getOldMessages(message);
                const request = buildRequest(messages);

                const response = https.post({
                    url: OPENAI_API_URL,
                    headers: getHeaders(),
                    body: JSON.stringify(request)
                });

                log.debug({
                    title: APP_NAME,
                    details: 'OpenAI request: ' + JSON.stringify(request)
                })

                log.debug({
                    title: APP_NAME,
                    details: 'OpenAI response: ' + response.body
                })

                responseJSON = JSON.parse(response.body);

                openAIResponse = parseOpenAIResponse(responseJSON);
                saveMessages(messages, openAIResponse);

            } catch (e) {
                throw new error.create({
                    name: 'UNABLE_TO_PARSE_RESPONSE_BODY',
                    message: 'Unable to parse response body: ' + e.message,
                    notifyOff: false
                });
            }

            if(context && isMagicWord) {
                openAIResponse.exposed = true;
                openAIResponse.exposedMessage = query;
            }

            scriptContext.response.write(JSON.stringify(openAIResponse));
        }

        const parseOpenAIResponse = (response) => {
            const result = {
                reply: 'Sorry, ChatGPT is currently unavailable. Please try again later.'
            }
            if(!response) return result;

            if(response.hasOwnProperty('choices')) {
                if(response['choices'][0] !== 'undefined') {
                    result.reply = response['choices'][0].message.content;
                    return result;
                }
            }

            log.debug({
                title: APP_NAME,
                details: 'Unable to parse OpenAI response.'
            });

            return result;
        }

        const buildRequest = (messages) => {
            return {
                "model": OPENAI_MODEL,
                "messages": messages,
                "temperature": OPENAI_TEMPERATURE
            };
        }

        const getOldMessages = (message) => {
            let messages = [];
            const currentUser = runtime.getCurrentUser().id;

            try {
                messages = file.load(`./${currentUser}.json`).getContents();
                messages = JSON.parse(messages);
            } catch (e) {}

            if(messages.length === 0) {
                messages.push({
                    "role": "system",
                    "content": SYSTEM_PROMPT
                });
            }

            messages.push(message);

            return messages;
        }

        const saveMessages = (messages, openAIResponse) => {
            const openAIMessage =  {"role": "assistant", "content": openAIResponse.reply};
            messages.push(openAIMessage);

            try {
                const currentUser = runtime.getCurrentUser().id;
                const currentScriptFileId = getScriptFileByScriptId(runtime.getCurrentScript().id);
                const currentScriptFolderId = getFolderIdByScriptFileId(currentScriptFileId);

                const messagesFile = file.create({
                    name: `${currentUser}.json`,
                    fileType: file.Type.JSON,
                    contents: JSON.stringify(messages),
                    folder: currentScriptFolderId
                })

                messagesFile.save();
            } catch (e) {
                log.debug({
                    title: APP_NAME,
                    details: `Unable to save session messages: ${JSON.stringify(e.message)}`
                })
            }
        }

        const getHeaders = () => {
            return {
                'Authorization': 'Bearer ' + OPENAI_API_KEY,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        }


        const getScriptFileByScriptId = (scriptId) => {
            try {
                const suiteQuery =  'SELECT scriptfile FROM SCRIPT where scriptid = ?'

                return query.runSuiteQL(
                    {
                        query: suiteQuery,
                        params: [scriptId]
                    }
                ).asMappedResults()[0].scriptfile;
            } catch (e) {
                return null
            }
        }

        const getFolderIdByScriptFileId = (scriptId) => {
            try {
                const suiteQuery = "SELECT folder from File WHERE id = ?";

                var queryResults = query.runSuiteQL(
                    {
                        query: suiteQuery,
                        params: [scriptId]
                    }
                ).asMappedResults();

                return queryResults[0].folder;
            } catch (e) {
                return null
            }
        }

        return {onRequest}

    });
