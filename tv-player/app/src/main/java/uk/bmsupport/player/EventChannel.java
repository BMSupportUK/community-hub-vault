package uk.bmsupport.player;
import java.util.Calendar;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
/** Daily feed display only: original channel identity remains untouched. */
final class EventChannel {
 private static final Pattern FEED=Pattern.compile("^\\s*(\\d{1,4})\\s*\\|\\s*(.*)$");
 private static final Pattern TIME=Pattern.compile("(?:^|\\s)([01]?\\d|2[0-3]):([0-5]\\d)(?=\\s|$)");
 static String label(String name,int row){Matcher m=FEED.matcher(name);return m.matches()?m.group(1):(row+1)+"  "+name;}
 static GuideGridView.Prog programme(String name,long now){
  Matcher m=FEED.matcher(name);if(!m.matches())return null;
  String text=m.group(2).trim();Matcher t=TIME.matcher(text);if(!t.find())return null;
  String title=(text.substring(0,t.start())+" "+text.substring(t.end())).trim();if(title.isEmpty())return null;
  Calendar date=Calendar.getInstance(TimeZone.getTimeZone("Europe/London"));date.setTimeInMillis(now*1000);
  date.set(Calendar.HOUR_OF_DAY,Integer.parseInt(t.group(1)));date.set(Calendar.MINUTE,Integer.parseInt(t.group(2)));date.set(Calendar.SECOND,0);date.set(Calendar.MILLISECOND,0);
  long start=date.getTimeInMillis()/1000;
  // Match saved fixtures' three-hour fallback when no finish time is supplied.
  return new GuideGridView.Prog(title,start,start+10800);
 }
}