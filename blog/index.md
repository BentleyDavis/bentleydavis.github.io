---
layout: page.njk
title: Reason Score Blog
---
<ul>
{%- for post in collections.post -%}
  <li{% if page.url == post.url %} class="active"{% endif %}>{{ post.data.title }}</li>
{%- endfor -%}
</ul>