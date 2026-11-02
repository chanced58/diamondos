import { THEME_PREFERENCES } from '@baseball/shared';
import { THEMED_PATH_PREFIXES } from './themed-paths';

/**
 * Pre-paint inline script (an IIFE string). Sets `data-theme` on `<html>` to the
 * resolved theme on signed-in app paths and `light` everywhere else, and applies
 * density/motion/tone from localStorage. Every storage / matchMedia access is
 * guarded, so a failure falls back to System (theme) or the defaults.
 *
 * Mirrors ThemeProvider, `isThemedPath` and `parseThemePreference`; keep in sync.
 */
export function buildAppearanceBootstrapScript(): string {
  return `(function(){
  var d=document.documentElement;
  var prefixes=${JSON.stringify(THEMED_PATH_PREFIXES)};
  var prefs=${JSON.stringify(THEME_PREFERENCES)};
  var densities=['compact','comfortable','spacious'];
  var motions=['on','off'];
  var tones=['utilitarian','editorial','energetic'];
  function pick(k,allow,fb){try{var v=localStorage.getItem(k);return v&&allow.indexOf(v)>-1?v:fb;}catch(e){return fb;}}
  function mq(q){try{return !!(window.matchMedia&&window.matchMedia(q).matches);}catch(e){return false;}}
  var theme='light';
  try{
    var path='';
    try{path=location.pathname||'';}catch(e){}
    var themed=false;
    for(var i=0;i<prefixes.length;i++){
      if(path===prefixes[i]||path.indexOf(prefixes[i]+'/')===0){themed=true;break;}
    }
    if(themed){
      var pref=pick('dos_theme',prefs,'system');
      theme=pref==='system'?(mq('(prefers-color-scheme: dark)')?'dark':'light'):pref;
    }
  }catch(e){theme='light';}
  var den='comfortable',m='on',to='editorial';
  try{
    den=pick('dos_density',densities,'comfortable');
    m=pick('dos_motion',motions,mq('(prefers-reduced-motion: reduce)')?'off':'on');
    to=pick('dos_tone',tones,'editorial');
  }catch(e){}
  try{
    d.setAttribute('data-theme',theme);
    d.setAttribute('data-density',den);
    d.setAttribute('data-motion',m);
    d.setAttribute('data-tone',to);
  }catch(e){}
})();`;
}
