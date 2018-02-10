import { Bot, MemoryStorage, BotStateManager } from 'botbuilder-core';
import { BotFrameworkAdapter } from 'botbuilder-services';
import { createServer } from 'restify';
import * as p from 'prague-fluent';
import 'isomorphic-fetch';
import { MatchRoute, MultipleRoute, TemplateRoute } from 'prague-fluent';
import { race } from 'rxjs/operators/race';

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

declare global {
    interface ConversationState {
        prompt?: string;
        routes?: p.TemplateRoute[];
    }
}

const regExp = (regExp: RegExp, c: BotContext) => () => regExp.exec(c.request.text);

const templates = new p.Templates<
    {
        showTime: {
            time: string
        },
        interviewMe: undefined,
        greeting: string,
        disambiguate: MultipleRoute,
    },
    BotContext
>(c => ({

    showTime(time) {
        c.reply(`The local time is ${time.time}`);
    },

    interviewMe() {
        c.state.conversation.prompt = 'name';
        return c.reply(`What's your name?`);
    },

    greeting(name) {
        c.state.conversation.prompt = undefined;
        return c.reply(`Nice to meet you, ${name}`);
    },

    disambiguate(route) {
        c.state.conversation.routes = route.routes;
        c.reply(`Are you telling me:`)
        route.routes.forEach(route => {
            c.reply(`${route.source}`);
        });
        c.state.conversation.prompt = 'disambiguate';
    },

}));

const botLogic = (c: BotContext) => {
    p.first(
        () => {
            if (c.request.type !== 'message')
                return p.do(() => c.reply("Non-message activity"));
        },
        p.match(regExp(/interview me/, c),
            templates.router('interviewMe')
        ),
        p.best(
            () => {
                switch (c.state.conversation.prompt) {
                    case 'name': {
                        return p.best(
                            p.match(regExp(/I am (.*)/i, c),
                                match => templates.route('greeting', match.value[1], "name", 1.0)
                            ),
                            p.match(regExp(/d+/, c),
                                match => templates.route('greeting', match.value[1], "name", .1),
                                templates.router('greeting', c.request.text, "name", .5),
                            )
                        )
                    }

                    case 'disambiguate': {
                        const route = c.state.conversation.routes.find(route => route.source === c.request.text);
                        if (route) {
                            c.state.conversation.prompt = undefined;
                            return new p.TemplateRoute(route.action, route.args);
                        }
                    }
                }
            },
            p.match(regExp(/time/, c),
                templates.router('showTime', { time: new Date().toLocaleTimeString() }, "time", .5)
            )
        )
        .mapMultiple(route => templates.router('disambiguate', route))
    )
    .mapTemplate(templates, c)
    .default(
        p.do(() => c.reply(`I don't understand you humans.`))
    )
    .do();
}

const bot = new Bot(adapter)
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .onReceive(botLogic);
