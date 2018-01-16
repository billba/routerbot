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
        routes: Array<any>;
    }
}

const regExp = (regExp: RegExp, c: BotContext) => () =>
    c.request.type === 'message' && regExp.exec(c.request.text);

interface PromptRouters {
    [promptID: string]: p.AnyRouter;
}

const templates = new p.Templates<
    {
        addName: string,
        addAge: number,
        correctAge: undefined,
        addPhone: string,
        correctPhone: undefined,
        tieBreaker: p.MultipleRoute,
    },
    BotContext
>(c => ({
    addName(name) {
        c.reply(`Got it! Your name is ${name}`);
        c.state.conversation.profile.name = name;
        removeFromOutstandingPrompts(c, 'name');
    },

    addAge(age) {
        c.reply(`Got it! Your age is ${age}`);
        c.state.conversation.profile.age = age;
        removeFromOutstandingPrompts(c, 'age');
    },

    addPhone(phone) {
        c.reply(`Got it! Your phone number is ${phone}`)
        c.state.conversation.profile.phone = phone;
        removeFromOutstandingPrompts(c, 'phone');
    },

    correctAge () {
        c.reply(`Age must be between 1 and 200`);
    },

    correctPhone() {
        c.reply(`Phone must be of the form xxx-yyy-zzzz`);
    },

    tieBreaker(route) {
        c.reply("We've got a tie! Tell me which you mean:")
        route.routes.forEach((route, i) => {
            c.reply(`"${route.source}"`);
        });
        c.state.conversation.routes = route.routes;
        addToOutstandingPrompts(c, 'tieBreaker');
    },
}));

const promptRouters = (c: BotContext): PromptRouters => ({
    'name':
        p.ifGet(regExp(/\D+/, c),
            templates.router('addName', c.request.text, "your name"),
            templates.router('addName', c.request.text, "your name", .25)
        ),

    'age':
        p.ifGet(regExp(/\d{1,4}/, c), match =>
            p.ifGet(
                () => {
                    const num = parseInt(match.value[0]);
                    if (num > 0 && num < 200)
                        return num;
                },
                match => templates.route('addAge', match.value, "your age"),
                templates.router('correctAge', undefined, "your age", .5)
            )
        ),

    'phone':
        p.ifGet(regExp(/^\d{3}-\d{3}-\d{4}$/, c),
            templates.router('addPhone', c.request.text, "your phone"),
            p.ifGet(regExp(/\d{3,}/, c),
                templates.router('correctPhone', undefined, "your phone", .5),
            )
        ),

    'tieBreaker':
        p.ifGet(
            () => c.state.conversation.routes.find(route => route.source === c.request.text),
            match => templates.route(match.value.action, match.value.args)
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
        .mapMultiple(route => templates.route('tieBreaker', route))
        .mapTemplate(templates, c)
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

const botLogic = (c: BotContext) => {
    if (c.request.type === 'message')
        return p
            .first(
                tryOutstandingPrompts(c),
                p.ifGet(regExp(/interview me/i, c),
                    p.do(() => interviewMe(c))
                ),
                p.do(() => c.reply("I just don't understand you humans."))
            )
            .do();
    c.reply("Non-message activity");
}

const bot = new Bot(adapter)
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .onReceive(botLogic);
