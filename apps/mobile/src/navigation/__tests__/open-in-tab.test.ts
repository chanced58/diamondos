import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import {
  channelScreen,
  eventScreen,
  findTabNavigator,
  gameScreen,
  openInTab,
  practiceScreen,
  tabNavigateArgs,
} from '../open-in-tab';

type FakeNav = { getState: () => { type: string }; getParent: () => FakeNav | undefined; navigate: jest.Mock };

function fakeNav(type: string, parent?: FakeNav): FakeNav {
  return { getState: () => ({ type }), getParent: () => parent, navigate: jest.fn() };
}
const asNav = (nav: FakeNav) => nav as unknown as NavigationProp<ParamListBase>;

describe('open-in-tab targets', () => {
  it('should name the stack routes the tab layouts register', () => {
    expect(gameScreen('g1')).toEqual({ tab: 'schedule', screen: 'games/[gameId]/index', params: { gameId: 'g1' } });
    expect(gameScreen('g1', 'live').screen).toBe('games/[gameId]/live');
    expect(eventScreen('e1')).toEqual({ tab: 'schedule', screen: 'events/[eventId]', params: { eventId: 'e1' } });
    expect(practiceScreen('p1')).toEqual({ tab: 'more', screen: 'practices/[practiceId]/index', params: { practiceId: 'p1' } });
    expect(channelScreen('c1')).toEqual({ tab: 'messages', screen: '[channelId]', params: { channelId: 'c1' } });
  });

  it('should ask the tab stack to keep its initial route beneath the screen', () => {
    expect(tabNavigateArgs(gameScreen('g1'))).toEqual([
      'schedule',
      { screen: 'games/[gameId]/index', params: { gameId: 'g1' }, initial: false },
    ]);
  });
});

describe('findTabNavigator', () => {
  it('should walk up from a screen in a tab stack to the tab navigator', () => {
    const tabs = fakeNav('tab', fakeNav('stack'));
    expect(findTabNavigator(asNav(fakeNav('stack', tabs)))).toBe(tabs);
  });

  it('should return undefined when no tab navigator is above', () => {
    expect(findTabNavigator(asNav(fakeNav('stack', fakeNav('stack'))))).toBeUndefined();
  });
});

describe('openInTab', () => {
  it('should navigate the tab navigator to the nested screen', () => {
    const tabs = fakeNav('tab');
    openInTab(asNav(fakeNav('stack', tabs)), gameScreen('g1', 'lineup'));
    expect(tabs.navigate).toHaveBeenCalledWith('schedule', {
      screen: 'games/[gameId]/lineup',
      params: { gameId: 'g1' },
      initial: false,
    });
  });

  it('should warn rather than fail silently with no tab navigator', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const stack = fakeNav('stack');
    openInTab(asNav(stack), gameScreen('g1'));
    expect(stack.navigate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('tab=schedule screen=games/[gameId]/index'));
    warn.mockRestore();
  });
});
