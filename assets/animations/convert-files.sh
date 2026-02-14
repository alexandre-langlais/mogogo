#!/bin/bash

# On cherche tous les fichiers .webp récursivement
find . -name "mogogo-pivot-2.webp" | while read -r file; do
    dir=$(dirname "$file")
    base=$(basename "$file")
    filename="${base%.*}"
    
    # On entre dans le dossier du fichier
    pushd "$dir" > /dev/null
    
    echo "--------------------------------------------"
    echo "Traitement de : $base"
    
    # 1. Création d'un dossier temporaire propre
    tmp_dir="tmp_frames_$filename"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    
    # 2. Extraction avec reconstruction du canevas (La clé du fix)
    # On force le 400x400 et le centrage ici
    convert -quiet "$base" -layers coalesce -gravity center -background none -extent 560x560 -resize 400x400 "$tmp_dir/f_%03d.png"
    
    # Vérification si l'extraction a fonctionné
    if [ -z "$(ls -A "$tmp_dir" 2>/dev/null)" ]; then
        echo "ERREUR : ImageMagick n'a pas pu extraire les frames de $base"
        rm -rf "$tmp_dir"
        popd > /dev/null
        continue
    fi

    # 3. Ré-assemblage avec img2webp (Standard Google)
    # On utilise les PNG générés juste avant
    img2webp -lossy -q 30 -m 6 -d 40 "$tmp_dir"/f_*.png -o "$filename-opt.webp"

    # 4. Finalisation
    if [ -f "$filename-opt.webp" ]; then
        # On remplace l'original
        mv "$filename-opt.webp" "$base"
        echo "SUCCÈS : $base est maintenant fluide et léger."
    else
        echo "ERREUR : img2webp a échoué pour $base"
    fi

    # Nettoyage
    rm -rf "$tmp_dir"
    
    # On revient au dossier précédent
    popd > /dev/null
done

echo "--------------------------------------------"
echo "Terminé ! Tous les Mogogos sont optimisés."
