/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @author Georgi Mihaylov <mihaylov@gmail.com>
 * @see {@link https://github.com/gmihaylov/netsuite-chatgpt-chat}
 */
define(['N/ui/serverWidget', 'N/file', 'N/url'],
    
    (ui, file, url) => {

        const suiteletScriptId = 'customscript_ns_chatgpt_chat_sl';
        const suiteletDeploymentId = 'customdeploy1';
        const contextMode = false; // !!! WARNING !!! If true, sensitive information will be exposed to ChatGPT

        /**
         * Defines the function definition that is executed before record is loaded.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @param {Form} scriptContext.form - Current form
         * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
         * @since 2015.2
         */
        const beforeLoad = (scriptContext) => {
                if(scriptContext.type === scriptContext.UserEventType.VIEW) {
                        const form = scriptContext.form;
                        const htmlFld = form.addField({
                                id: 'custpage_html',
                                type: ui.FieldType.INLINEHTML,
                                label: 'Chat Popup'
                        });
                        htmlFld.defaultValue = file.load({
                                id: './html/chat.html'
                        }).getContents().replace('${suiteletUrl}', getSuiteletUrl(scriptContext))
                }
        }

        const getSuiteletUrl = (scriptContext) => {
                if(contextMode) {
                        return url.resolveScript({
                                scriptId: suiteletScriptId,
                                deploymentId: suiteletDeploymentId,
                                returnExternalUrl: false
                        }) + `&context=true&id=${scriptContext.newRecord.id}&type=${scriptContext.newRecord.type}`;
                } else {
                        return url.resolveScript({
                                scriptId: suiteletScriptId,
                                deploymentId: suiteletDeploymentId,
                                returnExternalUrl: false
                        });
                }
        }

        return {beforeLoad}

    });
