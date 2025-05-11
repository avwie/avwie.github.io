import * as React from "react"
import {graphql} from "gatsby";
import DefaultLayout from "../layouts/default";
import {Helmet} from "react-helmet";

const Post = ({ data }) => {
    const { title, date, pageScripts } = data.markdown.frontmatter
    const content = data.markdown.html
    const excerpt = data.markdown.excerpt

    return (
        <DefaultLayout title={title}>
            <Helmet>
                {pageScripts &&
                    pageScripts.map((script, index) => (
                        <script
                            key={index}
                            src={script.src}
                            async={script.async || false}
                            defer={script.defer || false}
                        />
                    ))}

                <meta name="title" content={title} />
                <meta name="description" content={excerpt} />
                <meta property="og:title" content={title} />
                <meta property="og:description" content={excerpt} />
                <meta property="og:type" content="website" />
                <meta property="og:url" content={`https://avwie.github.io${data.markdown.frontmatter.slug}`} />
            </Helmet>
            <h1>{ title }</h1>
            <h4>{ date }</h4>
            <div dangerouslySetInnerHTML={{__html: content }} />
        </DefaultLayout>
    )
}

export default Post;

export const query = graphql`
query($slug: String!) {
    markdown: markdownRemark(frontmatter: { slug: { eq: $slug } }) {
        html
        excerpt(pruneLength: 250)
        frontmatter {
            date(formatString: "DD MMM, YYYY")
            slug
            title
            pageScripts {
                src
            }
        }
    }
}
`
