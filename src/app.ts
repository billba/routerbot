import { Bot, MemoryStorage, BotStateManager } from 'botbuilder-core';
import { BotFrameworkAdapter } from 'botbuilder-services';
import { createServer } from 'restify';
import * as p from 'prague-fluent';
import 'isomorphic-fetch';

// Create server
let server = createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`${server.name} listening to ${server.url}`);
});

// Create connector
const adapter = new BotFrameworkAdapter({ 
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

server.post('/api/messages', adapter.listen() as any);

interface Profile {
    name: string;
    phone: string;
    age: number;
}

declare global {
    interface ConversationState {
        outstandingPrompts: Array<string>;
        profile: Partial<Profile>;
    }
}

const regExp = (regExp: RegExp, c: BotContext) => () =>
    c.request.type === 'message' && regExp.exec(c.request.text);

interface PromptRouters {
    [promptID: string]: p.AnyRouter;
}

const addName = (c: BotContext, name: string) => {
    c.reply(`Got it! Your name is ${name}`);
    c.state.conversation.profile.name = name;
    removeFromOutstandingPrompts(c, 'name');
}

const promptRouters = (c: BotContext): PromptRouters => ({
    'name':
        p.ifGet(regExp(/\D+/, c),
            p.do(match => addName(c, match.value[0])),
            p.do(no => addName(c, c.request.text), .25)
        ),

    'age':
        p.ifGet(regExp(/\d{1,4}/, c), match =>
            p.ifGet(
                () => {
                    const num = parseInt(match.value[0]);
                    if (num > 0 && num < 200)
                        return num;
                },
                p.do(match => {
                    c.reply(`Got it! Your age is ${match.value}`);
                    c.state.conversation.profile.age = match.value;
                    removeFromOutstandingPrompts(c, 'age');
                }),
                p.do(
                    () => c.reply(`Age must be between 1 and 200`),
                    .4
                )
            )
        ),

    'phone':
        p.ifGet(regExp(/^\d{3}-\d{3}-\d{4}$/, c),
            p.do(match => {
                const digits = match.value[0]
                c.reply(`Got it! Your phone number is ${digits}`)
                c.state.conversation.profile.phone = digits;
                removeFromOutstandingPrompts(c, 'phone');
            }),
            p.ifGet(regExp(/\d{4,}/, c),
                p.do(
                    () => c.reply("Phone numbers must be of the form XXX-YYY-ZZZZ"),
                    0.5
                )
            )
        )
});

const addToOutstandingPrompts = (c: BotContext, promptID: string) => {
    if (!c.state.conversation.outstandingPrompts)
        c.state.conversation.outstandingPrompts = [];
    c.state.conversation.outstandingPrompts.push(promptID);
}

const removeFromOutstandingPrompts = (c: BotContext, promptID: string) => {
    c.state.conversation.outstandingPrompts = c.state.conversation.outstandingPrompts.filter(_promptID => _promptID !== promptID)
}

const outstandingPromptRouters = (c: BotContext) =>
    c.state.conversation.outstandingPrompts.map(promptID => promptRouters(c)[promptID]);

const tryOutstandingPrompts = (c: BotContext) => {
    if (!c.state.conversation.outstandingPrompts || c.state.conversation.outstandingPrompts.length === 0)
        return;
    
    return p
        .best(
            ... outstandingPromptRouters(c)
        )
        .afterDo(() => completePrompts(c))
        .default(p.do(() => c.reply("Sorry, I don't know what you're trying to tell me.")));
}

const interviewMe = (c: BotContext) => {
    c.reply("I'd like to get to know you. Please tell me your name, age, and phone number.");
    c.state.conversation.profile = {};
    addToOutstandingPrompts(c, 'phone');
    addToOutstandingPrompts(c, 'age');
    addToOutstandingPrompts(c, 'name');
}

const completePrompts = (c: BotContext) => {
    if (c.state.conversation.outstandingPrompts.length === 0) {
        c.reply("Thanks, nice to know you!!");
    }
}

const botLogic = (c: BotContext) =>
    p.if(() => c.request.type === 'message',
        p.first(
            tryOutstandingPrompts(c),
            p.ifGet(regExp(/interview me/i, c),
                p.do(() => interviewMe(c))
            ),
            p.do(() => c.reply("I just don't understand you humans."))
        ),
        p.do(() => c.reply("Non-message activity"))
    )
    .route();

const bot = new Bot(adapter)
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .onReceive(botLogic);
