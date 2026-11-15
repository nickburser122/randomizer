export const paint=t=>[...t].map(c=>'<i class="'+(/\d/.test(c)?'d':/[a-z]/i.test(c)?'l':'s')+'">'+c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</i>').join('');
