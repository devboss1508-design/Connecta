const menuBtn=document.getElementById('menuBtn');
const sideMenu=document.getElementById('sideMenu');
const menuOverlay=document.getElementById('menuOverlay');
const profileBtn=document.getElementById('profileBtn');
const logoutBtn=document.getElementById('logoutBtn');

function toggleMenu(open){
  sideMenu.classList.toggle('open',open);
  menuOverlay.classList.toggle('open',open);
}
menuBtn?.addEventListener('click',()=>toggleMenu(true));
menuOverlay?.addEventListener('click',()=>toggleMenu(false));

const saved=localStorage.getItem('connectaDemoUser');
if(saved){
  const user=JSON.parse(saved);
  const initials=((user.firstName||'U')[0]+(user.lastName||'')[0]).toUpperCase();
  if(profileBtn) profileBtn.textContent=initials || 'U';
}

profileBtn?.addEventListener('click',()=>alert('Profile screen will be added in the next frontend stage.'));
logoutBtn?.addEventListener('click',()=>{
  localStorage.removeItem('connectaLoggedIn');
  location.href='login.html';
});
