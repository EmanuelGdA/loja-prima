@echo off
echo --- PREPARANDO ARQUIVOS ---
git add .
echo.

set /p msg="O que voce alterou? (Mensagem do Commit): "
echo.

echo --- SALVANDO (COMMIT) ---
git commit -m "%msg%"
echo.

echo --- ENVIANDO PRO RENDER (PUSH) ---
git push
echo.
echo --- PRONTO! AGORA E SO ESPERAR O RENDER ---
pause