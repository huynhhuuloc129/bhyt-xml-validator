// Sends visitors who haven't logged in (in this tab) to login.html, and wires the
// username + logout button in the nav. Loaded in <head> so the page never shows first.

(function () {
  let user = null;
  try {
    user = sessionStorage.getItem("auth_user");
  } catch (e) {}
  if (!user) return location.replace("login.html");

  document.addEventListener("DOMContentLoaded", () => {
    const name = document.getElementById("user"),
      out = document.getElementById("logout");
    if (name) name.textContent = user;
    if (out)
      out.onclick = () => {
        try {
          sessionStorage.removeItem("auth_user");
        } catch (e) {}
        location.replace("login.html");
      };
  });
})();
