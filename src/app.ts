import { ConsoleAdapter } from 'botbuilder-node';
import { Bot, MemoryStorage, BotStateManager } from 'botbuilder';
import 'isomorphic-fetch';
// import { BotFrameworkAdapter } from 'botbuilder-services';
// import { createServer } from 'restify';
import { Topic } from 'botbuilder-topical';
import { SimpleForm } from 'botbuilder-topical';
import { StringPrompt } from 'botbuilder-topical';

const adapter = new ConsoleAdapter();

adapter.listen();

const bot = new Bot(adapter);

bot
    .use(new MemoryStorage())
    .use(new BotStateManager())
    .use({
        postActivity(context, activities, next) {
            for (let activity of activities) {
                if (activity.type === 'message') {
                    activity.text = '\n> '
                        + activity.text
                            .split('\n')
                            .join(`\n> `)
                        + '\n';
                }
            }
            return next();
        }
    })
    .onReceive(async context => {
        await Topic.do(context, () => alarmBot.createInstance(context));
    });

interface Alarm {
    name: string;
    when: string;
}

const listAlarms = (alarms: Alarm[]) => alarms
    .map(alarm => `* "${alarm.name}" set for ${alarm.when}`)
    .join('\n');

interface SetAlarmState {
    alarm: Partial<Alarm>;
    child: string;
}

interface ShowAlarmInitArgs {
    alarms: Alarm[]
}

const showAlarms = new Topic<any, ShowAlarmInitArgs>('showAlarms')
    .init((context, topic) => {
        if (topic.args.alarms.length === 0) {
            context.reply(`You haven't set any alarms.`);
        } else {
            context.reply(`You have the following alarms set:\n${listAlarms(topic.args.alarms)}`);
        }
        topic.complete();
    });

interface DeleteAlarmInitArgs {
    alarms: Alarm[];
}

interface DeleteAlarmState {
    alarms: Alarm[];
    alarmName: string;
    confirm: boolean;
    child: string;
}

interface DeleteAlarmCallbackArgs {
    alarmName: string;
}

const stringPrompt = new StringPrompt('stringPrompt');

const deleteAlarm = new Topic<DeleteAlarmInitArgs, DeleteAlarmState, DeleteAlarmCallbackArgs>('deleteAlarm')
    .init(async (context, topic) => {
        if (topic.args.alarms.length === 0) {
            context.reply(`You don't have any alarms.`);
            topic.complete();
            return;
        }

        topic.instance.state.alarms = topic.args.alarms;

        topic.instance.state.child = await topic.createTopicInstance(stringPrompt, {
            name: 'whichAlarm',
            prompt: `Which alarm do you want to delete?\n${listAlarms(topic.instance.state.alarms)}`,
        });
    })
    .onReceive(async (context, topic) => {
        if (topic.instance.state.child)
            await topic.dispatchToInstance(topic.instance.state.child);
    })
    .onComplete(stringPrompt, async (context, topic) => {
        switch (topic.args.name) {
            case 'whichAlarm':
                topic.instance.state.alarmName = topic.args.value;
                topic.instance.state.child = await topic.createTopicInstance(stringPrompt, {
                    name: 'confirm',
                    prompt: `Are you sure you want to delete alarm "${topic.args.value}"? (yes/no)"`,
                });
                break;
            case 'confirm':
                topic.complete(topic.args.value === 'yes'
                    ? {
                        alarmName: topic.instance.state.alarmName
                    }
                    : undefined
                )
                break;
        }
    });

interface AlarmBotState {
    child: string;
    alarms: Alarm[];
}

const simpleForm = new SimpleForm('simpleForm');

const helpText = `I know how to set, show, and delete alarms.`;

const alarmBot = new Topic<undefined, AlarmBotState, undefined>('alarmBot')
    .init((context, topic) => {
        context.reply(`Welcome to Alarm Bot!\n${helpText}`);
        topic.instance.state.alarms = [];
    })
    .onReceive(async (context, topic) => {
        if (topic.instance.state.child)
            return topic.dispatchToInstance(topic.instance.state.child);

        if (context.request.type === 'message') {
            if (/set|add|create/i.test(context.request.text)) {
                topic.instance.state.child = await topic.createTopicInstance(simpleForm, {
                    schema: {
                        name: {
                            type: 'string',
                            prompt: 'What do you want to call it?'
                        },
                        when: {
                            type: 'string',
                            prompt: 'For when do you want to set it?'
                        }
                    }
                });
            } else if (/show|list/i.test(context.request.text)) {
                topic.instance.state.child = await topic.createTopicInstance(showAlarms, {
                    alarms: topic.instance.state.alarms
                });
            } else if (/delete|remove/i.test(context.request.text)) {
                topic.instance.state.child = await topic.createTopicInstance(deleteAlarm, {
                    alarms: topic.instance.state.alarms
                });
            } else {
                context.reply(helpText);
            }
        }
    })
    .onComplete(simpleForm, (context, topic) => {
        topic.instance.state.alarms.push({
            name: topic.args.form['name'],
            when: topic.args.form['when'],
        });

        context.reply(`Alarm successfully added!`);
        
        topic.instance.state.child = undefined;
    })
    .onComplete(showAlarms)
    .onComplete(deleteAlarm, (context, topic) => {
        if (topic.args) {
            topic.instance.state.alarms = topic.instance.state.alarms
                .filter(alarm => alarm.name !== topic.args.alarmName);

            context.reply(`Alarm "${topic.args.alarmName}" has been deleted.`)
        } else {
            context.reply(`Okay, the status quo has been preserved.`)
        }

        topic.instance.state.child = undefined;
    });
