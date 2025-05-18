import { evaluateDiscipline } from "./evaluator.js";

document.getElementById("evaluateBtn").addEventListener("click", async () => {
  const id = document.getElementById("disciplineInput").value.trim();
  const ref = document.getElementById("referenceTextarea").value.trim();

  const output = document.getElementById("output");
  output.textContent = "⏳ Оцениваем...";

  try {
    const response = await evaluateDiscipline({
      disciplineId: id,
      referenceText: ref || null,
    });
    output.textContent = JSON.stringify(response.result, null, 2);
  } catch (err) {
    output.textContent = `❌ Ошибка: ${err.message}`;
  }
});
