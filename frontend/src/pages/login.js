  import { login, signup, getCurrentUser } from "../auth";
  import { setPlayerName } from "../state";

export function renderLogin(app) {
  const getAuthErrorMessage = (error) => {
    const rawMessage = error?.message || "Authentication failed";
    if (rawMessage.toLowerCase().includes("email not confirmed")) {
      return "Please confirm your email to log in";
    }
    return rawMessage;
  };

  const page = document.createElement("div");
  page.className = "page";

  const formContainer = document.createElement("div");
  formContainer.className = "form-container";

  const title = document.createElement("h1");
  title.textContent = "Battleship Login";
  formContainer.appendChild(title);

  const form = document.createElement("form");
  form.className = "auth-form";

  const toggleDiv = document.createElement("div");
  toggleDiv.className = "mode-toggle";
  let isLoginMode = true;

  const loginMode = document.createElement("button");
  loginMode.type = "button";
  loginMode.textContent = "Login";
  loginMode.className = "mode-btn active";

  const signupMode = document.createElement("button");
  signupMode.type = "button";
  signupMode.textContent = "Sign Up";
  signupMode.className = "mode-btn";

  toggleDiv.appendChild(loginMode);
  toggleDiv.appendChild(signupMode);

  form.appendChild(toggleDiv);

  // Email input
  const emailLabel = document.createElement("label");
  emailLabel.textContent = "Email:";
  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.name = "email";
  emailInput.required = true;
  emailInput.placeholder = "your@email.com";

  form.appendChild(emailLabel);
  form.appendChild(emailInput);

  // Username input (signup only)
  const usernameLabel = document.createElement("label");
  usernameLabel.textContent = "Username:";
  const usernameInput = document.createElement("input");
  usernameInput.type = "text";
  usernameInput.name = "username";
  usernameInput.placeholder = "2-20 characters";
  usernameInput.style.display = "none";

  form.appendChild(usernameLabel);
  usernameLabel.style.display = "none";
  form.appendChild(usernameInput);

  // Password input
  const passwordLabel = document.createElement("label");
  passwordLabel.textContent = "Password:";
  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.name = "password";
  passwordInput.required = true;
  passwordInput.placeholder = "At least 6 characters";

  form.appendChild(passwordLabel);
  form.appendChild(passwordInput);

  // Error message
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.style.display = "none";
  form.appendChild(errorDiv);

  // Submit button
  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn";
  submitBtn.textContent = "Login";

  form.appendChild(submitBtn);

  // Toggle mode handlers
  loginMode.addEventListener("click", (e) => {
    e.preventDefault();
    isLoginMode = true;
    loginMode.classList.add("active");
    signupMode.classList.remove("active");
    submitBtn.textContent = "Login";
    title.textContent = "Battleship Login";
    usernameInput.style.display = "none";
    usernameLabel.style.display = "none";
    usernameInput.removeAttribute("required");
  });

  signupMode.addEventListener("click", (e) => {
    e.preventDefault();
    isLoginMode = false;
    signupMode.classList.add("active");
    loginMode.classList.remove("active");
    submitBtn.textContent = "Sign Up";
    title.textContent = "Create Account";
    usernameInput.style.display = "block";
    usernameLabel.style.display = "block";
    usernameInput.required = true;
  });

  // Form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const username = usernameInput.value.trim();

    errorDiv.style.display = "none";
    errorDiv.textContent = "";

    if (!email || !password) {
      errorDiv.textContent = "Please fill in all fields";
      errorDiv.style.display = "block";
      return;
    }

    if (!isLoginMode && !username) {
      errorDiv.textContent = "Username is required";
      errorDiv.style.display = "block";
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = isLoginMode ? "Logging in..." : "Creating account...";

      if (isLoginMode) {
        await login(email, password);
      } else {
        await signup(email, password, username);
      }

      // Get the user and set player name to username
      const user = getCurrentUser();
      const displayName = user?.user_metadata?.username || "Unknown";
      setPlayerName(displayName);
      
      // Redirect to lobby
      window.location.hash = "#/lobby";
    } catch (error) {
      errorDiv.textContent = getAuthErrorMessage(error);
      errorDiv.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = isLoginMode ? "Login" : "Sign Up";
    }
  });

  formContainer.appendChild(form);
  page.appendChild(formContainer);
  app.appendChild(page);
}
