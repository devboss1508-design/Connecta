document.querySelectorAll('.show-password').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const input=document.getElementById(btn.dataset.target);
    input.type=input.type==='password'?'text':'password';
    btn.textContent=input.type==='password'?'Show':'Hide';
  });
});

const registerForm=document.getElementById('registerForm');
if(registerForm){
  registerForm.addEventListener('submit',e=>{
    e.preventDefault();
    const message=document.getElementById('registerMessage');
    const user={
      firstName:document.getElementById('firstName').value.trim(),
      lastName:document.getElementById('lastName').value.trim(),
      username:document.getElementById('username').value.trim(),
      email:document.getElementById('email').value.trim(),
      phone:document.getElementById('phone').value.trim()
    };
    localStorage.setItem('connectaDemoUser',JSON.stringify(user));
    message.style.color='#15803D';
    message.textContent='Account details saved for this frontend demo.';
    setTimeout(()=>location.href='dashboard.html',700);
  });
}

const loginForm=document.getElementById('loginForm');
if(loginForm){
  loginForm.addEventListener('submit',e=>{
    e.preventDefault();
    const message=document.getElementById('loginMessage');
    const saved=localStorage.getItem('connectaDemoUser');
    if(saved){
      localStorage.setItem('connectaLoggedIn','true');
      message.style.color='#15803D';
      message.textContent='Login successful.';
      setTimeout(()=>location.href='dashboard.html',500);
    }else{
      message.textContent='No demo account found. Create an account first.';
    }
  });
}
